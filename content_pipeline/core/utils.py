import re
from json_repair import repair_json


def clean_llm_response(raw: str) -> str:
    raw = re.sub(r"^```(?:json)?", "", raw.strip()).rstrip("```").strip()

    return repair_json(raw)
