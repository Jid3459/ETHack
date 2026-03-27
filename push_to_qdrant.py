import csv
import json
from io import StringIO

from content_pipeline.tools.retriever import Document, Retriever


csv_data = open("regulation_docs.csv", "r", encoding="utf-8").read()


def parse_csv_to_documents(csv_text: str) -> list[Document]:
    reader = csv.DictReader(StringIO(csv_text))
    documents = []

    for row in reader:
        applies_to = []
        if row["applies_to"]:
            try:
                applies_to = json.loads(row["applies_to"])
            except json.JSONDecodeError:
                # fallback if malformed
                applies_to = [row["applies_to"]]

        doc = Document(
            regulatory_body=row["regulatory_body"] or "",
            circular_number=row["circular_number"] or "",
            section=row["section"] or "",
            title=row["title"] or "",
            text=row["text"] or "",
            applies_to=applies_to,
            date=row["date"] or "",
        )
        documents.append(doc)

    return documents


retriever = Retriever()
retriever.create_collection(force=True)  # WARNING: deletes existing data
documents = parse_csv_to_documents(csv_data)
retriever.embed_documents(documents)
