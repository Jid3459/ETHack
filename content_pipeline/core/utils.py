import re


def clean_llm_response(raw: str) -> str:
    """
    Strip Qwen3 think blocks and markdown fences before JSON parsing.
    Import this in every agent that parses LLM JSON output.
    """
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    raw = re.sub(r"^```(?:json)?", "", raw.strip()).rstrip("```").strip()
    return raw
