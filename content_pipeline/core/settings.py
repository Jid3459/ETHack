import os
from dotenv import load_dotenv

load_dotenv()

# ── LLM ───────────────────────────────────────────────────────────────────────
LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "llama_cpp")
LLAMA_CPP_MODEL_PATH: str = os.getenv("LLAMA_CPP_MODEL_PATH", "")
LLAMA_CPP_N_CTX: int = int(os.getenv("LLAMA_CPP_N_CTX", "4096"))
LLAMA_CPP_N_GPU_LAYERS: int = int(os.getenv("LLAMA_CPP_N_GPU_LAYERS", "0"))

# Gemini
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

# OpenRouter
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "mistralai/mistral-7b-instruct")
OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

# OpenRouter
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"


# ── Qdrant ────────────────────────────────────────────────────────────────────
QDRANT_URL: str = os.getenv("QDRANT_URL", "localhost:6333")

# Collection names
REGULATORY_DOC_COLLECTION: str = "regulatory_documents"
COMPANY_PROFILES_COLLECTION: str = "company_profiles"
FEEDBACK_MEMORY_COLLECTION: str = "feedback_memory"
CONTENT_PATTERNS_COLLECTION: str = "content_patterns"
AUDIT_LOGS_COLLECTION: str = "audit_logs"

# ── Embedding ─────────────────────────────────────────────────────────────────
EMBEDDING_NAME: str = "BAAI/bge-m3"
CHUNK_SIZE: int = 500
CHUNK_OVERLAP: int = 50

# ── Pipeline tuning ───────────────────────────────────────────────────────────
MAX_BRAND_REVISIONS: int = 3
MAX_LEGAL_REVISIONS: int = 2
BRAND_PASS_THRESHOLD: float = 0.70  # score must be >= this to pass
TOP_K_REGULATORY_CHUNKS: int = 3  # chunks retrieved per claim

SARVAM_MODEL_PATH: str = os.getenv("SARVAM_MODEL_PATH", "")
SARVAM_N_CTX: int = int(os.getenv("SARVAM_N_CTX", "4096"))
SARVAM_N_GPU_LAYERS: int = int(os.getenv("SARVAM_N_GPU_LAYERS", "0"))
