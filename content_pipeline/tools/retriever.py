"""
Retriever — extended from the original RAG implementation.

Fixes applied to the original code:
  - embed_query("a") → embed_query for vector size detection (was embed_text)
  - payload merge was `metadata | chunks[i]` (merges str into dict, wrong)
    → corrected to metadata | {"chunk_text": chunks[i]}
  - retrieve() joined raw ScoredPoint objects → now formats properly
  - Added retrieve_for_claims() for Agent 3's per-claim parallel retrieval
  - Added filter helpers for metadata-scoped retrieval
"""

from __future__ import annotations

from functools import lru_cache
import uuid
from typing import List, Optional

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel
from qdrant_client import QdrantClient, models
from transformers import AutoTokenizer

from content_pipeline.core.settings import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    EMBEDDING_NAME,
    QDRANT_URL,
    REGULATORY_DOC_COLLECTION,
)

# ── Singletons (loaded once at import time) ───────────────────────────────────


@lru_cache(maxsize=1)
def get_langchain_hf_embedding():
    return HuggingFaceEmbeddings(model_name=EMBEDDING_NAME)


@lru_cache(maxsize=1)
def get_hf_tokenizer():
    return AutoTokenizer.from_pretrained(
        EMBEDDING_NAME, use_fast=True, local_files_only=True
    )


@lru_cache(maxsize=1)
def get_retriever():
    return Retriever()


@lru_cache(maxsize=1)
def get_qdrant_client():
    return QdrantClient(url=QDRANT_URL)


_tokenizer = get_hf_tokenizer()
_embedding = get_langchain_hf_embedding()
qdrant_client = get_qdrant_client()


# ── Document schema ───────────────────────────────────────────────────────────
class Document(BaseModel):
    regulatory_body: str  # e.g. "RBI", "NPCI", "ASCI"
    circular_number: str  # e.g. "RBI/2019-20/174"
    section: str  # e.g. "8.4"
    title: str  # e.g. "Merchant Communication"
    text: str  # full section text to be chunked
    applies_to: List[str] = []  # e.g. ["settlement_claims", "payment_gateway"]
    date: str = ""  # e.g. "2020-03-17"


# ── Retriever ─────────────────────────────────────────────────────────────────
class Retriever:
    """
    Manages ingestion and retrieval for the regulatory_documents collection.

    Two retrieval methods:
      retrieve()             — single query, returns formatted string
      retrieve_for_claims()  — list of claims, returns per-claim dict
                               used by Agent 3 for parallel evaluation
    """

    def __init__(self) -> None:
        self.client = qdrant_client
        self._splitter = RecursiveCharacterTextSplitter.from_huggingface_tokenizer(
            _tokenizer,
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
        )

    # ── Collection management ─────────────────────────────────────────────────

    def create_collection(self, force: bool = False) -> None:
        """
        Create the regulatory_documents collection.
        If it already exists, prompts user unless force=True.
        """
        if self.client.collection_exists(REGULATORY_DOC_COLLECTION):
            if not force:
                res = (
                    input(
                        "Regulatory collection already exists. Delete and recreate? (y/n): "
                    )
                    .strip()
                    .lower()
                )
                if res not in ("y", "yes"):
                    print("Skipping collection creation.")
                    return
            self.client.delete_collection(REGULATORY_DOC_COLLECTION)

        # Detect embedding dimension from a test query
        sample_vector = _embedding.embed_query("dimension probe")
        self.client.create_collection(
            REGULATORY_DOC_COLLECTION,
            vectors_config=models.VectorParams(
                size=len(sample_vector),
                distance=models.Distance.COSINE,
            ),
        )
        print(
            f"Created collection '{REGULATORY_DOC_COLLECTION}' "
            f"(dim={len(sample_vector)})"
        )

    # ── Ingestion ─────────────────────────────────────────────────────────────

    def embed_documents(self, documents: List[Document]) -> None:
        """
        Chunk, embed, and upsert a list of Document objects.

        Each chunk stored with full metadata so Agent 3 can produce
        specific citations like "RBI/2019-20/174 Section 8.4".
        """
        for doc in documents:
            chunks = self._splitter.split_text(doc.text)
            if not chunks:
                continue

            vectors = _embedding.embed_documents(chunks)

            base_metadata = {
                "regulatory_body": doc.regulatory_body,
                "circular_number": doc.circular_number,
                "section": doc.section,
                "title": doc.title,
                "applies_to": doc.applies_to,
                "date": doc.date,
                # Note: full section text stored for display; chunk_text
                # is the actual retrieved content for that point
                "source_title": doc.title,
            }

            points = [
                models.PointStruct(
                    id=str(uuid.uuid4()),
                    vector=vectors[i],
                    payload=base_metadata | {"chunk_text": chunks[i]},
                )
                for i in range(len(chunks))
            ]

            self.client.upsert(
                collection_name=REGULATORY_DOC_COLLECTION,
                points=points,
            )
        print(
            f"Ingested {len(documents)} document(s) into '{REGULATORY_DOC_COLLECTION}'"
        )

    # ── Retrieval ─────────────────────────────────────────────────────────────

    def retrieve(
        self,
        query: str,
        applies_to_filter: Optional[str] = None,
        limit: int = 3,
    ) -> str:
        """
        Retrieve top-k regulatory chunks for a query.

        Args:
            query:             semantic search string
            applies_to_filter: optional metadata tag to pre-filter,
                               e.g. "settlement_claims"
            limit:             number of chunks to return

        Returns:
            Formatted string ready to be injected into an LLM prompt.
        """
        query_vector = _embedding.embed_query(query)

        qdrant_filter: Optional[models.Filter] = None
        if applies_to_filter:
            qdrant_filter = models.Filter(
                must=[
                    models.FieldCondition(
                        key="applies_to",
                        match=models.MatchAny(any=[applies_to_filter]),
                    )
                ]
            )

        results = self.client.query_points(
            collection_name=REGULATORY_DOC_COLLECTION,
            query=query_vector,
            limit=limit,
            query_filter=qdrant_filter,
        )

        if not results.points:
            return "No relevant regulatory documents found."

        parts: list[str] = []
        for point in results.points:
            p = point.payload
            parts.append(
                f"SOURCE: {p.get('circular_number', 'N/A')} "
                f"Section {p.get('section', 'N/A')} — {p.get('title', '')}\n"
                f"BODY: {p.get('chunk_text', '')}\n"
                f"{'-' * 60}"
            )
        return "\n\n".join(parts)

    def retrieve_for_claims(
        self,
        claims: List[str],
        limit_per_claim: int = 3,
    ) -> dict[str, str]:
        """
        Retrieve regulatory context for each claim independently.
        Used by Agent 3 to do focused per-claim compliance evaluation.

        Returns:
            {claim_text: formatted_regulatory_context_string}
        """
        results: dict[str, str] = {}
        for claim in claims:
            results[claim] = self.retrieve(claim, limit=limit_per_claim)
        return results
