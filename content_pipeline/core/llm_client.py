"""
LLM client abstraction.
Change LLM_PROVIDER in .env to switch providers.

Providers:
  llama_cpp   — local llama-cpp-python
  gemini      — Google Gemini via API
  openrouter  — OpenRouter
"""

from __future__ import annotations

from functools import lru_cache

from langchain_community.chat_models import ChatLlamaCpp
from langchain_core.language_models import BaseChatModel

from content_pipeline.core.settings import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLAMA_CPP_MODEL_PATH,
    LLAMA_CPP_N_CTX,
    LLAMA_CPP_N_GPU_LAYERS,
    LLM_PROVIDER,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
)

# ── Provider factory ──────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_llm() -> BaseChatModel:
    """
    Returns a cached LangChain-compatible chat model.

    Usage in any agent:
        from content_pipeline.core.llm_client import get_llm
        llm = get_llm()
        response = llm.invoke(messages)          # sync
        response = await llm.ainvoke(messages)   # async (Agent 3)
    """
    if LLM_PROVIDER == "llama_cpp":
        if not LLAMA_CPP_MODEL_PATH:
            raise ValueError(
                "LLAMA_CPP_MODEL_PATH not set in .env. "
                "Set it to the full path of your Qwen GGUF file, e.g.:\n"
                "  LLAMA_CPP_MODEL_PATH=/models/qwen2.5-7b-instruct-q4_k_m.gguf"
            )
        return ChatLlamaCpp(
            model_path=LLAMA_CPP_MODEL_PATH,
            n_ctx=LLAMA_CPP_N_CTX,
            n_gpu_layers=LLAMA_CPP_N_GPU_LAYERS,
            temperature=0.7,
            max_tokens=1024,
            verbose=False,
        )

    elif LLM_PROVIDER == "gemini":
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not set in .env")
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            google_api_key=GEMINI_API_KEY,
            temperature=0.7,
        )

    elif LLM_PROVIDER == "openrouter":
        if not OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY not set in .env")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url=OPENROUTER_BASE_URL,
            api_key=OPENROUTER_API_KEY,
            model=OPENROUTER_MODEL,
            temperature=0.7,
        )

    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER='{LLM_PROVIDER}'. "
            "Choose: llama_cpp | gemini | openrouter"
        )
