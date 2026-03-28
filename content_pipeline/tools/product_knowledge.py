"""
ProductKnowledgeStore — stores and retrieves internal product documentation.

Agent 1 queries this before drafting to enrich content with accurate product
details, feature specs, and internal positioning that isn't in the LLM's weights.

Populated via the ingest_docs.py CLI (PDF, DOCX, CSV, TXT, MD files).
"""

from __future__ import annotations

import uuid as _uuid

from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import models

from content_pipeline.tools.retriever import (
    get_hf_tokenizer,
    get_qdrant_client,
    get_langchain_hf_embedding,
)
from content_pipeline.core.settings import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
)

PRODUCT_KNOWLEDGE_COLLECTION = "product_knowledge"

_embedding = get_langchain_hf_embedding()
_splitter = RecursiveCharacterTextSplitter.from_huggingface_tokenizer(
    get_hf_tokenizer(),
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
)


class ProductKnowledgeStore:
    """
    Manages the product_knowledge Qdrant collection.

    Each point is a text chunk from an ingested document:
      - text: chunk content
      - source_file: original filename
      - file_type: "pdf" | "docx" | "csv" | "txt" | "md"
      - company_id: which company owns this doc
      - chunk_index: position within source doc
      - page_number: for PDFs (optional)
    """

    def __init__(self) -> None:
        self.client = get_qdrant_client()

    def _ensure_collection(self) -> None:
        """Create product_knowledge collection if it doesn't exist."""
        if self.client.collection_exists(PRODUCT_KNOWLEDGE_COLLECTION):
            return
        sample = _embedding.embed_query("dimension probe")
        self.client.create_collection(
            PRODUCT_KNOWLEDGE_COLLECTION,
            vectors_config=models.VectorParams(
                size=len(sample),
                distance=models.Distance.COSINE,
            ),
        )
        print(
            f"[ProductKnowledgeStore] Created collection '{PRODUCT_KNOWLEDGE_COLLECTION}'"
        )

    def ingest_text(
        self,
        text: str,
        source_file: str,
        file_type: str,
        company_id: str = "default",
        extra_metadata: dict | None = None,
    ) -> int:
        """
        Chunk, embed, and upsert raw text into the product_knowledge collection.
        Returns number of chunks stored.
        """
        self._ensure_collection()

        chunks = _splitter.split_text(text)
        points = []
        for i, chunk in enumerate(chunks):
            vector = _embedding.embed_query(chunk)
            payload: dict = {
                "company_id": company_id,
                "source_file": source_file,
                "file_type": file_type,
                "chunk_index": i,
                "text": chunk,
            }
            if extra_metadata:
                payload.update(extra_metadata)
            points.append(
                models.PointStruct(
                    id=str(_uuid.uuid4()),
                    vector=vector,
                    payload=payload,
                )
            )

        if points:
            self.client.upsert(
                collection_name=PRODUCT_KNOWLEDGE_COLLECTION,
                points=points,
            )

        print(
            f"[ProductKnowledgeStore] Ingested {len(points)} chunks "
            f"from '{source_file}' (company={company_id})"
        )
        return len(points)

    def retrieve(
        self,
        query: str,
        company_id: str = "default",
        limit: int = 3,
    ) -> str:
        """
        Retrieve top-k product knowledge chunks for a query.
        Returns formatted string for injection into draft prompt.
        Returns empty string if nothing relevant found.
        """
        self._ensure_collection()

        try:
            query_vector = _embedding.embed_query(query)

            # Filter by company_id when specified
            filter_condition = (
                models.Filter(
                    must=[
                        models.FieldCondition(
                            key="company_id",
                            match=models.MatchValue(value=company_id),
                        )
                    ]
                )
                if company_id != "default"
                else None
            )

            results = self.client.search(
                collection_name=PRODUCT_KNOWLEDGE_COLLECTION,
                query_vector=query_vector,
                query_filter=filter_condition,
                limit=limit,
                with_payload=True,
            )
        except Exception as exc:
            print(f"[ProductKnowledgeStore] Search failed (non-fatal): {exc}")
            return ""

        if not results:
            return ""

        chunks = []
        for hit in results:
            p = hit.payload or {}
            source = p.get("source_file", "internal doc")
            chunks.append(f"[{source}] {p.get('text', '')}")

        return "\n---\n".join(chunks)

    def list_sources(self, company_id: str = "default") -> list[dict]:
        """List all ingested source files for a company."""
        self._ensure_collection()
        try:
            results, _ = self.client.scroll(
                collection_name=PRODUCT_KNOWLEDGE_COLLECTION,
                scroll_filter=(
                    models.Filter(
                        must=[
                            models.FieldCondition(
                                key="company_id",
                                match=models.MatchValue(value=company_id),
                            )
                        ]
                    )
                    if company_id != "default"
                    else None
                ),
                limit=1000,
                with_payload=True,
                with_vectors=False,
            )
        except Exception:
            return []

        seen: dict[str, dict] = {}
        for pt in results:
            p = pt.payload or {}
            src = p.get("source_file", "unknown")
            if src not in seen:
                seen[src] = {
                    "source_file": src,
                    "file_type": p.get("file_type", ""),
                    "chunks": 0,
                }
            seen[src]["chunks"] += 1

        return list(seen.values())
