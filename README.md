# ContentShield — AI-Powered Enterprise Content Operations

<div align="center">

![ContentShield Banner](https://img.shields.io/badge/ContentShield-Enterprise%20Content%20AI-3b82f6?style=for-the-badge&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![LangGraph](https://img.shields.io/badge/LangGraph-Multi--Agent-10b981?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=for-the-badge&logo=fastapi&logoColor=white)

**A production-grade, multi-agent AI pipeline that automates the full lifecycle of enterprise content — from brief to brand-safe, legally reviewed, localised, and distributed content — with human-in-the-loop approval at every critical stage.**

[Architecture](#architecture) · [Agents](#the-8-agent-pipeline) · [Setup](#setup) · [Demo](#running-the-demo) · [API](#api-reference) · [Features](#feature-overview)

</div>

---

## What ContentShield Does

ContentShield solves a problem every enterprise marketing team faces: creating content that is simultaneously **on-brand**, **legally compliant**, **SEO-optimised**, and **published across multiple channels and languages** — without a 5-hour manual cycle per piece.

A human provides a one-line brief. Eight AI agents handle everything else:

```
Brief → Strategy → Draft → Brand Check → Legal Review → Human Gate → Localise → Distribute
```

**Measurable outcomes:**

- ⏱ **85% reduction** in content cycle time (5h manual → 45 min automated)
- ⬡ **Brand violations caught** before a single word goes live
- ⚖ **Regulatory flags** cited against actual RBI/ASCI/NPCI circulars
- 🌐 **6 Indian languages** localised using Sarvam AI + LLM refinement
- 📊 **Engagement feedback loop** — Agent 7 learns what performs, improves next draft

---

## Repository Structure

```
ET_Hack/
│
├── content_pipeline/              ← Python backend (FastAPI + LangGraph)
│   ├── agents/
│   │   ├── agent0_strategy.py     ← Strategy Advisor — recommends platforms
│   │   ├── agent1_drafter.py      ← Content Drafter — generates draft
│   │   ├── agent2_quality.py      ← Brand Compliance Guardian
│   │   ├── agent3_legal.py        ← Legal & Regulatory Reviewer (RAG)
│   │   ├── agent4_localizer.py    ← Sarvam + LLM localisation
│   │   ├── agent5_distributor.py  ← Multi-channel publisher
│   │   ├── agent6_image_generator.py ← Branded image card generator
│   │   └── agent7_feedback.py     ← Post-publish analytics collector
│   │
│   ├── core/
│   │   ├── state.py               ← Shared ContentState TypedDict
│   │   ├── settings.py            ← Environment config
│   │   ├── llm_client.py          ← Multi-provider LLM abstraction
│   │   ├── audit.py               ← Audit trail helpers
│   │   └── utils.py               ← LLM response cleaning
│   │
│   ├── tools/
│   │   ├── retriever.py           ← Qdrant RAG for regulatory docs
│   │   ├── product_knowledge.py   ← Internal doc knowledge base
│   │   ├── feedback_memory.py     ← Engagement feedback store
│   │   ├── content_patterns.py    ← Publishing pattern learner
│   │   └── image_generation/
│   │       └── image_generator.py ← Playwright + HTML template renderer
│   │
│   ├── api.py                     ← FastAPI REST endpoints
│   └── graph.py                   ← LangGraph pipeline definition
│
├── content-pipeline-ui/           ← React + TypeScript frontend
│   └── src/
│       ├── pages/
│       │   ├── LandingPage.tsx    ← Public landing with Magic Rings
│       │   ├── Onboarding.tsx     ← Company profile registration
│       │   ├── BriefInput.tsx     ← Content brief + A/B toggle
│       │   ├── PipelineProgress.tsx ← Live 8-agent progress view
│       │   ├── HumanApproval.tsx  ← Review gate with compliance reports
│       │   ├── AuditLog.tsx       ← Full decision trail dashboard
│       │   └── Dashboard.tsx      ← ROI metrics + scheduling + analytics
│       │
│       ├── components/
│       │   ├── KnowledgeUploader.tsx ← Doc upload for Knowledge-to-Content
│       │   ├── ROIImpactStrip.tsx    ← Live ROI calculator
│       │   └── ABVariantPanel.tsx    ← A/B variant comparison
│       │
│       ├── api/client.ts          ← All API calls
│       ├── context/AppContext.tsx ← Global state (companyId, runId)
│       ├── mock/mockServer.ts     ← Demo mode (no backend needed)
│       └── types/index.ts         ← Shared TypeScript interfaces
│
├── brand_images/                  ← Company brand assets for image gen
│   └── razorpay/
│       ├── image_data.json
│       ├── logo.png
│       ├── linkedin_bg.jpg
│       └── instagram_bg.jpg
│
├── regulatory_docs/               ← RBI/ASCI/NPCI PDFs for legal RAG
├── ingest_docs.py                 ← CLI to ingest docs into Qdrant
├── requirements.txt
└── .env.example
```

---

## The 8-Agent Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CONTENTSHIELD PIPELINE                           │
│                                                                         │
│  [Brief] ──► Agent 0 ──► Agent 1 ──► Agent 2 ──► Agent 3               │
│             Strategy    Drafter    Brand Check  Legal Review             │
│                            ▲            │             │                  │
│                            │    FAIL    │             │ HIGH FLAG        │
│                            └────────────┘             │                  │
│                                                       ▼                  │
│                                              ┌── Human Gate ──┐          │
│                                              │   INTERRUPT    │          │
│                                              └────────────────┘          │
│                                                    │ APPROVE              │
│                                                    ▼                     │
│                              Agent 6 ──► Agent 4 ──► Agent 5             │
│                              Image Gen  Localiser  Distributor           │
│                                                       │                  │
│                                                       ▼                  │
│                                                  [Published]             │
│                                                       │                  │
│                                     24-48h later      ▼                  │
│                                                   Agent 7                │
│                                                  Feedback               │
└─────────────────────────────────────────────────────────────────────────┘
```

| Agent | Name                      | Role                                                                                               |
| ----- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| **0** | Strategy Advisor          | Reads engagement history from Qdrant, recommends 2–3 platforms with fit scores, format, timing     |
| **1** | Content Drafter           | Generates draft using company profile + product knowledge RAG + feedback memory                    |
| **2** | Brand Compliance Guardian | Two-layer check: regex hard rules + LLM semantic violation detection; scores 0–100                 |
| **3** | Legal Reviewer            | Per-claim RAG evaluation against RBI, ASCI, NPCI regulatory documents; cites exact circulars       |
| **4** | Localiser                 | Sarvam Translate (GGUF, local) → LLM refinement for naturalness + official disclaimer translations |
| **5** | Distributor               | Publishes via Buffer (LinkedIn/Twitter), WordPress REST API (blog), SendGrid (email)               |
| **6** | Image Generator           | Extracts headline + CTA via LLM, renders branded PNG via Playwright + HTML template                |
| **7** | Feedback Collector        | Polls Buffer/WordPress/SendGrid analytics APIs; stores in Qdrant; Agent 1 learns from it           |

### Brand Compliance Loop

Agent 2 scores drafts against brand rules. If `score < 0.70`, the draft routes **back to Agent 1** with the violations injected. This repeats up to 3 times before escalating to the human gate. Agent 1 never sees the same instructions twice — each revision gets the specific fix suggestions from the violation report.

### Legal Review — RAG Against Real Regulations

Agent 3 extracts every factual claim from the draft using regex signal detection (percentages, superlatives, product capability verbs). Each claim is independently evaluated against retrieved chunks from actual RBI, ASCI, and NPCI documents stored in Qdrant. Flags include the exact circular number and section, e.g., `RBI/2019-20/174 Section 8.4`.

---

## Feature Overview

### ✅ Multi-Agent Pipeline (Judging Criterion 1)

Full LangGraph orchestration with conditional edges, INTERRUPT/resume at human gate, SQLite or MemorySaver checkpointing.

### ✅ Brand Governance (Judging Criterion 4)

Real-time brand score, violation detection with exact phrase highlighting, auto-revision loop, mandatory disclaimer checking.

### ✅ Content Intelligence (Judging Criterion 2)

Agent 0 reads past engagement patterns from Qdrant. Agent 7 collects real analytics after publishing. The system improves with every run.

### ✅ Knowledge-to-Content (Judging Criterion 3)

Upload any PDF, DOCX, CSV, TXT, or MD via the UI. Content is chunked, embedded, and stored in Qdrant. Agent 1 automatically retrieves relevant chunks before drafting — content uses accurate internal product specs, not just LLM priors.

### ✅ A/B Variant Testing

Generate two parallel pipeline runs from the same brief — Variant A (data-led) and Variant B (story-led). Both run through the full 8-agent pipeline independently. The dashboard shows side-by-side comparison with a winner badge based on engagement rate.

### ✅ ROI Impact Dashboard

Live counters showing hours saved, ₹ cost saved, brand violations caught, legal risks prevented. Interactive ROI calculator with sliders for post volume and copywriter rate.

### ✅ Scheduling

Set publish time per run. Integrated with Buffer's `scheduled_at` parameter, WordPress `future` status, and SendGrid send scheduling.

### ✅ Multi-language

English + Hindi, Tamil, Telugu, Bengali using Sarvam-1 GGUF (local inference) with LLM post-processing for fintech terminology transliteration.

### ✅ Branded Image Generation

Platform-specific image cards (LinkedIn 1.91:1, Instagram 1:1) generated via Playwright rendering HTML templates with company brand colors, logo, and LLM-extracted copy.

### ✅ Phoenix Tracing

Full LLM traces, token counts, latency per agent — visible at `localhost:6006` via Arize Phoenix.

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Qdrant](https://qdrant.tech/documentation/quick-start/) running locally
- An LLM provider key (Groq is fastest for demo; Gemini also works)

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/contentshield.git
cd contentshield
```

### 2. Backend setup

```bash
cd content_pipeline

# Create virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# For GPU-accelerated local inference (optional)
# CMAKE_ARGS="-DLLAMA_CUDA=on" pip install llama-cpp-python --force-reinstall
```

### 3. Environment configuration

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```env
# ── LLM Provider (choose one) ──────────────────────────────────────────────
LLM_PROVIDER=groq           # groq | gemini | openrouter | llama_cpp

# Groq (recommended for demo — fast, free tier available)
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Google Gemini (alternative)
# GEMINI_API_KEY=your_gemini_key_here
# GEMINI_MODEL=gemini-1.5-flash

# Local llama.cpp (no API key needed, requires GGUF model file)
# LLM_PROVIDER=llama_cpp
# LLAMA_CPP_MODEL_PATH=/path/to/your-model.gguf
# LLAMA_CPP_N_GPU_LAYERS=35

# ── Qdrant ─────────────────────────────────────────────────────────────────
QDRANT_URL=http://localhost:6333

# ── Embeddings ─────────────────────────────────────────────────────────────
EMBEDDING_NAME=BAAI/bge-m3     # downloads automatically on first run (~550MB)

# ── Distribution (optional — pipeline simulates if not set) ───────────────
BUFFER_ACCESS_TOKEN=
BUFFER_LINKEDIN_PROFILE_ID=
BUFFER_TWITTER_PROFILE_ID=
WORDPRESS_URL=
WORDPRESS_USER=
WORDPRESS_APP_PASSWORD=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
SENDGRID_LIST_ID=

# ── Sarvam localisation (optional — LLM fallback if not set) ──────────────
# SARVAM_MODEL_PATH=/path/to/sarvam-1.gguf
```

### 4. Start Qdrant

```bash
# Using Docker (recommended)
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# Or download the binary: https://qdrant.tech/documentation/quick-start/
```

### 5. Ingest regulatory documents (for legal review)

Sample docs are included in `regulatory_docs/`. Ingest them into Qdrant:

```bash
python ingest_docs.py regulatory_docs/rbi_pa_pg_2020.pdf
python ingest_docs.py regulatory_docs/asci_code.pdf
python ingest_docs.py regulatory_docs/npci_upi_circular.pdf
```

### 6. Start the backend

```bash
uvicorn content_pipeline.api:app --reload --port 8001
```

The API is now live at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 7. Frontend setup

```bash
cd ../content-pipeline-ui

npm install

# Start the dev server
npm start
```

The UI is now live at `http://localhost:3000`.

### 8. (Optional) Start Phoenix tracing

```bash
# In a separate terminal
python -m phoenix.server.main serve
# Dashboard at http://localhost:6006
```

---

## Running the Demo

The fastest way to see the full pipeline without any external API keys:

### Option A — Frontend demo mode (no backend needed)

Navigate to `http://localhost:3000` → click **Load Demo** on the Onboarding page. The UI runs against a built-in mock server that cycles through all pipeline states including brand revision, legal flag, human approval, and distribution.

### Option B — Full live pipeline with Groq

```bash
# 1. Make sure backend is running on port 8001
# 2. Open http://localhost:3000
# 3. Click "Load Demo" → navigates to New Content
# 4. Enter a brief: "Write a LinkedIn post about Razorpay Magic Checkout reducing cart abandonment"
# 5. Select LinkedIn + Post + English
# 6. Click "Run Content Pipeline"
# 7. Watch 8 agents run in real-time on the Pipeline page
# 8. Approve at the Human Review Gate
# 9. See localised versions + distribution receipts
```

### Option C — Direct API (for judges who prefer curl)

```bash
# Onboard Razorpay demo company
curl -X POST http://localhost:8000/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "payzen_demo",
    "name": "Payzen",
    "industry": "Fintech",
    "tone": "Professional, bold",
    "brand_voice": "Direct, merchant-first",
    "required_disclaimers": [],
    "approved_terms": {}
  }'

# Start a pipeline run
curl -X POST http://localhost:8000/run \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "payzen_demo",
    "brief": "LinkedIn post about Magic Checkout reducing cart abandonment by 35%",
    "channel": "linkedin",
    "content_type": "post",
    "target_languages": ["en", "hi"]
  }'

# Poll status (replace RUN_ID with the id returned above)
curl http://localhost:8000/status/RUN_ID

# View dashboard
curl http://localhost:8000/dashboard/razorpay_demo

# View ROI metrics
curl http://localhost:8000/roi/razorpay_demo
```

---

## API Reference

| Method | Endpoint                  | Description                              |
| ------ | ------------------------- | ---------------------------------------- |
| `POST` | `/onboard`                | Register a company profile               |
| `POST` | `/run`                    | Start a single pipeline run              |
| `POST` | `/run/variants`           | Start A/B variant test (2 parallel runs) |
| `GET`  | `/status/{run_id}`        | Poll live pipeline status                |
| `POST` | `/approve/{run_id}`       | Submit human decision (approve/reject)   |
| `GET`  | `/audit/{run_id}`         | Full decision audit trail                |
| `GET`  | `/runs/{company_id}`      | List all runs for a company              |
| `GET`  | `/dashboard/{company_id}` | Aggregated dashboard payload             |
| `GET`  | `/roi/{company_id}`       | ROI impact metrics                       |
| `POST` | `/schedule/{run_id}`      | Set/update scheduled publish time        |
| `POST` | `/ingest/{company_id}`    | Upload internal doc (PDF/DOCX/CSV)       |
| `GET`  | `/ingest/{company_id}`    | List ingested documents                  |
| `POST` | `/feedback/{run_id}`      | Trigger Agent 7 analytics collection     |
| `GET`  | `/feedback/{run_id}`      | Get collected engagement analytics       |
| `GET`  | `/variants/{ab_group_id}` | Compare A/B variant results              |
| `GET`  | `/knowledge/{company_id}` | List product knowledge documents         |

Full interactive docs: `http://localhost:8000/docs`

---

## Technical Stack

### Backend

| Layer         | Technology                              |
| ------------- | --------------------------------------- |
| Orchestration | LangGraph 1.1.3 with INTERRUPT/resume   |
| LLM (default) | Groq `llama-3.3-70b-versatile`          |
| LLM (local)   | llama-cpp-python + Qwen 2.5 GGUF        |
| Translation   | Sarvam-1 GGUF (local) + LangChain LLM   |
| Embeddings    | `BAAI/bge-m3` via HuggingFace           |
| Vector DB     | Qdrant (5 collections)                  |
| API           | FastAPI + Uvicorn                       |
| Image Gen     | Playwright (headless Chromium) + Pillow |
| Tracing       | Arize Phoenix + OpenInference           |

### Qdrant Collections

| Collection             | Purpose                              |
| ---------------------- | ------------------------------------ |
| `regulatory_documents` | RBI/ASCI/NPCI chunks for legal RAG   |
| `product_knowledge`    | Internal docs ingested via `/ingest` |
| `feedback_memory`      | Post-publish engagement analytics    |
| `content_patterns`     | Publishing history for Agent 0       |
| `audit_logs`           | Persistent audit trail               |

### Frontend

| Layer      | Technology                                         |
| ---------- | -------------------------------------------------- |
| Framework  | React 18 + TypeScript                              |
| Routing    | React Router v6                                    |
| Animation  | Framer Motion                                      |
| Styling    | Inline styles + CSS-in-JS (no Tailwind dependency) |
| Background | Custom WebGL aurora (OGL) + Canvas particle system |
| Fonts      | Outfit (display) + DM Sans (body)                  |
| State      | React Context (AppContext)                         |

---

## LLM Provider Switching

Switch providers without changing any agent code — only `.env` changes:

```env
# Groq (recommended — fast, good free tier)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...

# Google Gemini
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...

# OpenRouter (access 100+ models)
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=mistralai/mistral-7b-instruct

# Local llama.cpp (zero API cost, needs GPU for speed)
LLM_PROVIDER=llama_cpp
LLAMA_CPP_MODEL_PATH=/models/qwen2.5-7b-instruct-q4_k_m.gguf
LLAMA_CPP_N_GPU_LAYERS=35
```

---

## Knowledge-to-Content — Ingesting Internal Docs

Upload your own product specs, press releases, or internal reports to enrich content:

```bash
# CLI ingestion
python ingest_docs.py path/to/product_spec.pdf --company razorpay_demo
python ingest_docs.py path/to/q3_report.docx   --company razorpay_demo
python ingest_docs.py path/to/features.csv     --company razorpay_demo

# Or use the UI — drag and drop on the New Content page
# Supported: PDF, DOCX, CSV, TXT, MD
```

Agent 1 automatically retrieves the 3 most relevant chunks before every draft. The content will reference your actual product metrics and positioning rather than LLM priors.

---

## Evaluation Criteria Mapping

This submission directly addresses all four judging criteria:

| Criterion                                      | How We Address It                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Full workflow automation**                   | 8-agent LangGraph pipeline from brief to published — zero manual steps except the human gate                                        |
| **Multi-agent coordination**                   | Conditional edges, brand revision loop (Agent 2 → Agent 1), legal revision loop (Agent 3 → Agent 1), INTERRUPT/resume at human gate |
| **Measurable reduction in content cycle time** | 85% reduction (5h → 45min). Live ROI dashboard shows hours saved, ₹ cost saved per run                                              |
| **Working compliance guardrails**              | Agent 2: brand score + auto-revision. Agent 3: per-claim RAG against real RBI/ASCI circulars with exact section citations           |

---

## Known Limitations & Production TODOs

- `MemorySaver` checkpointer loses state on server restart — replace with `SqliteSaver` for persistence
- Distribution credentials are optional — pipeline simulates publish if not configured (marked in receipts as `simulated`)
- Sarvam GGUF model is large (~4GB) — Agent 4 falls back to main LLM translation if not configured
- Brand image generation requires Playwright (`playwright install chromium`) and a local image server on port 8080

---

## Project Team

Built for the **Economic Times Hackathon 2026** — Track 1: AI for Enterprise Content Operations.

---

<div align="center">

**ContentShield** · Built with LangGraph, FastAPI, React, and Qdrant

_From brief to published — brand-safe, legally reviewed, human-approved._

</div>
