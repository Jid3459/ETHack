"""
ingest_docs.py — Multi-format document ingestion CLI

Ingest PDFs, Word docs (DOCX), CSVs, plain text, and Markdown files
into the product_knowledge Qdrant collection, making them available
to Agent 1 for accurate product-specific content generation.

Usage:
  python ingest_docs.py path/to/file.pdf
  python ingest_docs.py path/to/file.docx --company razorpay_demo
  python ingest_docs.py path/to/folder/ --company razorpay_demo
  python ingest_docs.py path/to/regulation.csv --collection regulatory

Requirements (all free, no API keys):
  pymupdf    — pip install pymupdf          (PDF parsing)
  python-docx — pip install python-docx    (DOCX parsing)
  csv, pathlib — Python standard library   (CSV, TXT, MD)

Output:
  Qdrant product_knowledge collection — queried by Agent 1 before drafting
  Terminal: progress logs showing chunks ingested per file
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path


# ── Parsers ───────────────────────────────────────────────────────────────────


def parse_pdf(file_path: str) -> str:
    """Extract all text from a PDF using PyMuPDF (free, no API key)."""
    try:
        import fitz  # pymupdf
    except ImportError:
        print("ERROR: pymupdf not installed. Run: pip install pymupdf")
        sys.exit(1)

    doc = fitz.open(file_path)
    pages = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text")
        if text.strip():
            pages.append(f"[Page {page_num}]\n{text}")
    doc.close()
    return "\n\n".join(pages)


def parse_docx(file_path: str) -> str:
    """Extract all text from a Word document using python-docx (free)."""
    try:
        from docx import Document
    except ImportError:
        print("ERROR: python-docx not installed. Run: pip install python-docx")
        sys.exit(1)

    doc = Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def parse_csv_as_knowledge(file_path: str) -> str:
    """
    Convert CSV rows to readable text chunks.
    Each row becomes a prose sentence: "field1: value1, field2: value2."
    """
    rows_as_text = []
    with open(file_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            parts = [f"{k}: {v}" for k, v in row.items() if v and v.strip()]
            if parts:
                rows_as_text.append(", ".join(parts) + ".")
    return "\n".join(rows_as_text)


def parse_text(file_path: str) -> str:
    """Read plain text or Markdown file."""
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


# ── File router ───────────────────────────────────────────────────────────────

_PARSERS = {
    ".pdf": ("pdf", parse_pdf),
    ".docx": ("docx", parse_docx),
    ".doc": ("docx", parse_docx),
    ".csv": ("csv", parse_csv_as_knowledge),
    ".txt": ("txt", parse_text),
    ".md": ("md", parse_text),
    ".markdown": ("md", parse_text),
}


def ingest_file(
    file_path: str,
    company_id: str,
    collection: str = "product_knowledge",
) -> int:
    """
    Route a single file to the appropriate parser and ingest into Qdrant.
    Returns the number of chunks stored.
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext not in _PARSERS:
        print(f"  SKIP {path.name} — unsupported format '{ext}'")
        print(f"  Supported: {', '.join(_PARSERS.keys())}")
        return 0

    file_type, parser_fn = _PARSERS[ext]
    print(f"  Parsing {path.name} ({file_type.upper()})...")

    text = parser_fn(file_path)
    if not text.strip():
        print(f"  SKIP {path.name} — no text content extracted")
        return 0

    print(f"  Extracted {len(text):,} characters")

    if collection == "regulatory":
        # Ingest into regulatory_documents using existing Retriever
        # For regulatory CSVs only — use push_to_qdrant.py for structured regulatory data
        print(
            "  NOTE: For regulatory CSVs with structured columns, use push_to_qdrant.py instead."
        )

    # Default: product_knowledge collection
    from content_pipeline.tools.product_knowledge import ProductKnowledgeStore
    store = ProductKnowledgeStore()
    chunks = store.ingest_text(
        text=text,
        source_file=path.name,
        file_type=file_type,
        company_id=company_id,
        extra_metadata={"source_path": str(path.resolve())},
    )

    print(f"  Stored {chunks} chunks from '{path.name}' → product_knowledge (company={company_id})")
    return chunks


# ── CLI ───────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest documents into the product_knowledge Qdrant collection.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python ingest_docs.py product_sheet.pdf
  python ingest_docs.py features.docx --company razorpay_demo
  python ingest_docs.py ./docs/ --company razorpay_demo
  python ingest_docs.py data.csv --company razorpay_demo

After ingestion, Agent 1 will retrieve relevant product facts before drafting.
View ingested sources: python ingest_docs.py --list --company razorpay_demo
        """,
    )
    parser.add_argument(
        "path",
        nargs="?",
        help="File or directory to ingest",
    )
    parser.add_argument(
        "--company",
        default="razorpay_demo",
        help="Company ID to tag ingested docs (default: razorpay_demo)",
    )
    parser.add_argument(
        "--collection",
        default="product_knowledge",
        choices=["product_knowledge", "regulatory"],
        help="Target Qdrant collection (default: product_knowledge)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List already-ingested sources for the company",
    )

    args = parser.parse_args()

    print("=" * 60)
    print("  ETHack Document Ingestion Tool")
    print("  Target: Qdrant → product_knowledge collection")
    print("=" * 60)

    if args.list:
        from content_pipeline.tools.product_knowledge import ProductKnowledgeStore
        store = ProductKnowledgeStore()
        sources = store.list_sources(company_id=args.company)
        if not sources:
            print(f"\nNo documents ingested yet for company '{args.company}'.")
        else:
            print(f"\nIngested sources for company '{args.company}':")
            for s in sources:
                print(f"  {s['source_file']} ({s['file_type']}) — {s['chunks']} chunks")
        return

    if not args.path:
        parser.print_help()
        return

    target = Path(args.path)
    if not target.exists():
        print(f"\nERROR: Path not found: {target}")
        sys.exit(1)

    # Collect files to process
    if target.is_dir():
        files = [
            str(f)
            for f in target.rglob("*")
            if f.is_file() and f.suffix.lower() in _PARSERS
        ]
        if not files:
            print(f"\nNo supported files found in {target}")
            print(f"Supported formats: {', '.join(_PARSERS.keys())}")
            sys.exit(1)
        print(f"\nFound {len(files)} file(s) in {target}:")
    else:
        files = [str(target)]
        print(f"\nIngesting: {target.name}")

    total_chunks = 0
    for file_path in files:
        print(f"\n→ {Path(file_path).name}")
        chunks = ingest_file(file_path, company_id=args.company, collection=args.collection)
        total_chunks += chunks

    print(f"\n{'=' * 60}")
    print(f"  Done. Stored {total_chunks} chunks total.")
    print(f"  Company: {args.company}")
    print(f"  Agent 1 will now use these docs when drafting content.")
    print("=" * 60)


if __name__ == "__main__":
    main()
