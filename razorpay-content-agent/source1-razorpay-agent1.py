"""
Source 1: Razorpay Blog Scraper + Enriched Saver
-------------------------------------------------
Fetches blog posts via Jina Reader, saves them in 3 formats:
  - data/raw/          → .md files  (human-readable, for your team)
  - data/structured/   → enriched .json files (for Agent 1 RAG + Agent 2 compliance)
  - data/chroma_ready/ → chroma_docs.json (bulk load into ChromaDB)

Run once to build the knowledge base. Re-run weekly for fresh content.
No API keys needed for this file.
"""

import requests
import json
import os
import re
import time
import hashlib
from datetime import datetime
from xml.etree import ElementTree as ET


# ── Output folders ─────────────────────────────────────────────────────────────
os.makedirs("data/raw",          exist_ok=True)
os.makedirs("data/structured",   exist_ok=True)
os.makedirs("data/chroma_ready", exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1: FETCH BLOG URLs FROM SITEMAP
# ══════════════════════════════════════════════════════════════════════════════

def get_blog_urls_from_sitemap() -> list[str]:
    """
    Razorpay uses a two-level sitemap structure:
      sitemap_index.xml → child sitemaps → actual blog post URLs
    Returns a flat list of all blog post URLs found.
    """
    sitemap_index_url = "https://razorpay.com/blog/sitemap_index.xml"
    print(f"Fetching sitemap index: {sitemap_index_url}")

    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    # Step 1: fetch the index to get child sitemap URLs
    index_res = requests.get(sitemap_index_url, timeout=15, headers=headers)
    index_root = ET.fromstring(index_res.text)
    child_sitemaps = [loc.text for loc in index_root.findall(".//sm:loc", ns)]
    print(f"Found {len(child_sitemaps)} child sitemaps inside the index")

    # Step 2: fetch each child sitemap and collect blog post URLs
    blog_urls = []
    for child_url in child_sitemaps:
        print(f"  Reading child sitemap: {child_url}")
        child_res = requests.get(child_url, timeout=15, headers=headers)
        child_root = ET.fromstring(child_res.text)
        urls = [loc.text for loc in child_root.findall(".//sm:loc", ns)]
        blog_urls.extend(urls)
        time.sleep(0.5)

    print(f"Total blog post URLs found: {len(blog_urls)}")
    return blog_urls


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2: FETCH ONE BLOG POST VIA JINA READER
# ══════════════════════════════════════════════════════════════════════════════

def fetch_with_jina(url: str) -> dict:
    """
    Jina Reader (r.jina.ai) converts any public URL to clean markdown.
    Free, no API key, handles JS-rendered pages.
    """
    jina_url = f"https://r.jina.ai/{url}"
    headers = {
        "Accept": "application/json",
        "X-Return-Format": "markdown",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    res = requests.get(jina_url, headers=headers, timeout=30)

    if res.status_code != 200:
        print(f"  FAILED {url} → HTTP {res.status_code}")
        return None

    try:
        data = res.json()
        return {
            "url":        url,
            "title":      data.get("data", {}).get("title", ""),
            "description":data.get("data", {}).get("description", ""),
            "markdown":   data.get("data", {}).get("content", ""),
            "scraped_at": datetime.utcnow().isoformat()
        }
    except Exception:
        # fallback if Jina returns plain text instead of JSON
        return {
            "url":         url,
            "title":       url.rstrip("/").split("/")[-1].replace("-", " ").title(),
            "description": "",
            "markdown":    res.text,
            "scraped_at":  datetime.utcnow().isoformat()
        }


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3: ENRICHMENT HELPERS (used by save_structured_json_enriched)
# ══════════════════════════════════════════════════════════════════════════════

FINTECH_TAGS = [
    "UPI", "payments", "payment gateway", "merchants", "developers",
    "API", "SDK", "checkout", "invoicing", "subscriptions", "payroll",
    "banking", "RBI", "NPCI", "PCI-DSS", "KYC", "settlement",
    "refunds", "disputes", "onboarding", "lending", "forex",
    "QR code", "POS", "ecommerce", "fintech", "startup"
]

def extract_tags(text: str) -> list[str]:
    """
    Scans post content for known Razorpay/fintech keywords.
    Used for keyword-filtered RAG retrieval in Agent 1.
    """
    text_lower = text.lower()
    return [tag for tag in FINTECH_TAGS if tag.lower() in text_lower]


def detect_format(text: str, title: str) -> str:
    """
    Guesses content format from structural signals.
    Agent 1 uses this to match format when drafting new content.
    Returns one of: how_to_guide, explainer, product_announcement,
                    comparison, listicle, thought_leadership
    """
    title_lower = title.lower()
    if any(w in title_lower for w in ["how to", "guide", "step", "tutorial"]):
        return "how_to_guide"
    if any(w in title_lower for w in ["what is", "introduction", "explained"]):
        return "explainer"
    if any(w in title_lower for w in ["launch", "new", "introducing", "announce"]):
        return "product_announcement"
    if any(w in title_lower for w in ["vs", "compare", "difference"]):
        return "comparison"

    bullet_count   = text.count("\n- ") + text.count("\n* ")
    numbered_count = len(re.findall(r"\n\d+\.", text))
    if bullet_count > 5 or numbered_count > 4:
        return "listicle"

    return "thought_leadership"


def detect_audience(text: str) -> str:
    """
    Guesses primary target audience from content signals.
    Agent 1 adjusts tone and vocabulary based on this.
    Returns one of: developers, merchants, finance_teams
    """
    dev_signals     = ["api", "sdk", "webhook", "endpoint", "curl",
                       "integration", "developer", "documentation", "code"]
    merch_signals   = ["merchant", "business", "sales", "customer", "store",
                       "revenue", "checkout experience", "your customers"]
    finance_signals = ["cfo", "finance team", "reconciliation", "accounting",
                       "gst", "invoice", "tally", "balance sheet"]

    t = text.lower()
    scores = {
        "developers":    sum(1 for s in dev_signals     if s in t),
        "merchants":     sum(1 for s in merch_signals   if s in t),
        "finance_teams": sum(1 for s in finance_signals if s in t)
    }
    return max(scores, key=scores.get)


def extract_key_claims(text: str, n: int = 8) -> list[str]:
    """
    Pulls factual sentences — numbers, product names, specific claims.
    Agent 1 injects these as grounding facts to avoid hallucinating stats.
    """
    sentences = re.split(r'(?<=[.!?])\s+', text)
    fact_signals = re.compile(
        r'\d+%|\d+x|₹|crore|lakh|million|\bAPI\b|\bSDK\b|RBI|NPCI|'
        r'launch|integrat|support|enabl|allow|process|automat',
        re.IGNORECASE
    )
    scored = [
        (len(fact_signals.findall(s)), s.strip())
        for s in sentences if 30 < len(s) < 300
    ]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for _, s in scored[:n] if s]


def compute_style_signals(text: str) -> dict:
    """
    Lightweight style fingerprint of the post.
    Agent 1 loads this into its system prompt to match Razorpay's writing style.
    """
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    words     = text.split()

    avg_sentence_len = (
        sum(len(s.split()) for s in sentences) / len(sentences)
        if sentences else 0
    )
    bullet_count    = text.count("\n- ") + text.count("\n* ")
    has_subheadings = (text.count("\n## ") + text.count("\n### ")) > 2
    uses_bold       = text.count("**") > 4

    conversational  = len(re.findall(r'\byou\b|\byour\b', text, re.I))
    formal          = len(re.findall(r'\bone must\b|\bit is\b|\bshall\b', text, re.I))
    tone            = "conversational" if conversational > formal else "formal"

    return {
        "avg_sentence_length_words": round(avg_sentence_len, 1),
        "uses_bullet_points":        bullet_count > 3,
        "uses_subheadings":          has_subheadings,
        "uses_bold_emphasis":        uses_bold,
        "tone":                      tone,
        "approx_reading_time_min":   round(len(words) / 200)
    }


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4: SAVE IN 3 FORMATS
# ══════════════════════════════════════════════════════════════════════════════

def save_raw_markdown(post: dict) -> str:
    """
    Saves the raw markdown as a .md file.
    WHO USES THIS: teammates, for reading and debugging scraped content.
    """
    slug     = post["url"].rstrip("/").split("/")[-1]
    filepath = f"data/raw/{slug}.md"

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"# {post['title']}\n")
        f.write(f"> Source: {post['url']}\n")
        f.write(f"> Scraped: {post['scraped_at']}\n\n")
        f.write(post["markdown"])

    return filepath


def save_structured_json_enriched(post: dict) -> str:
    """
    Saves an enriched JSON per blog post.
    WHO USES THIS:
      - Agent 1 (Content Creator) — RAG retrieval, style matching, fact grounding
      - Agent 2 (Compliance Reviewer) — reads content + key_claims for risk checks

    JSON fields:
      id, url, title, description, source, scraped_at  → identity
      content, word_count, char_count                   → raw content
      tags, content_format, target_audience             → retrieval signals
      key_claims                                        → grounding facts
      style_signals                                     → tone + formatting habits
    """
    slug   = post["url"].rstrip("/").split("/")[-1]
    doc_id = hashlib.md5(post["url"].encode()).hexdigest()[:12]
    md     = post["markdown"]

    structured = {
        # identity
        "id":               doc_id,
        "url":              post["url"],
        "title":            post["title"],
        "description":      post["description"],
        "source":           "razorpay_blog",
        "scraped_at":       post["scraped_at"],

        # raw content
        "content":          md,
        "word_count":       len(md.split()),
        "char_count":       len(md),

        # Agent 1 retrieval signals
        "tags":             extract_tags(md),
        "content_format":   detect_format(md, post["title"]),
        "target_audience":  detect_audience(md),

        # Agent 1 grounding facts (stops hallucination of stats)
        "key_claims":       extract_key_claims(md),

        # Agent 1 style matching
        "style_signals":    compute_style_signals(md)
    }

    filepath = f"data/structured/{slug}.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(structured, f, indent=2, ensure_ascii=False)

    return filepath


def append_to_chroma_manifest(post: dict, all_docs: list):
    """
    Chunks the post and appends to master ChromaDB manifest.
    WHO USES THIS: ingest_to_chroma.py loads this into ChromaDB.
    All agents then query ChromaDB for RAG.

    Chunks at 500 words so embeddings stay under token limits.
    Metadata carries tags + audience so agents can filter before vector search.
    """
    doc_id = hashlib.md5(post["url"].encode()).hexdigest()[:12]
    words  = post["markdown"].split()
    chunks = [" ".join(words[i:i+500]) for i in range(0, len(words), 500)]

    tags     = extract_tags(post["markdown"])
    audience = detect_audience(post["markdown"])
    fmt      = detect_format(post["markdown"], post["title"])

    for idx, chunk in enumerate(chunks):
        all_docs.append({
            "id":       f"{doc_id}_chunk{idx}",
            "document": chunk,
            "metadata": {
                "source":           "razorpay_blog",
                "url":              post["url"],
                "title":            post["title"],
                "chunk_index":      idx,
                "total_chunks":     len(chunks),
                "scraped_at":       post["scraped_at"],
                "tags":             ", ".join(tags),       # ChromaDB needs string not list
                "target_audience":  audience,
                "content_format":   fmt
            }
        })


def save_chroma_manifest(all_docs: list) -> str:
    """
    Saves one master JSON file for bulk ChromaDB ingestion.
    Format ChromaDB expects: documents, metadatas, ids as parallel lists.
    """
    manifest = {
        "documents": [d["document"] for d in all_docs],
        "metadatas": [d["metadata"] for d in all_docs],
        "ids":       [d["id"]       for d in all_docs]
    }
    filepath = "data/chroma_ready/razorpay_blog_chroma.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\nSaved ChromaDB manifest → {filepath}")
    print(f"Total chunks ready for embedding: {len(all_docs)}")
    return filepath


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5: MAIN RUNNER
# ══════════════════════════════════════════════════════════════════════════════

def run_source1_ingestion(limit: int = 40):
    """
    Full pipeline. Set limit=40 for hackathon (enough for a solid demo).
    Set limit=None to scrape everything.
    """
    blog_urls = get_blog_urls_from_sitemap()
    if limit:
        blog_urls = blog_urls[:limit]

    all_chroma_docs  = []
    success, failed  = 0, 0

    for i, url in enumerate(blog_urls):
        print(f"[{i+1}/{len(blog_urls)}] Fetching: {url}")
        post = fetch_with_jina(url)

        if not post or len(post["markdown"]) < 200:
            print(f"  Skipping — too short or failed")
            failed += 1
            continue

        md_path   = save_raw_markdown(post)
        json_path = save_structured_json_enriched(post)
        append_to_chroma_manifest(post, all_chroma_docs)

        word_count = len(post["markdown"].split())
        print(f"  Saved → {md_path} | {json_path} | {word_count} words")
        success += 1

        time.sleep(1)

    save_chroma_manifest(all_chroma_docs)

    summary = {
        "run_at":                datetime.utcnow().isoformat(),
        "source":                "razorpay_blog",
        "total_urls_found":      len(blog_urls),
        "successfully_scraped":  success,
        "failed":                failed,
        "total_chroma_chunks":   len(all_chroma_docs),
        "output_folders": {
            "raw_markdown":   "data/raw/",
            "structured_json":"data/structured/",
            "chroma_manifest":"data/chroma_ready/razorpay_blog_chroma.json"
        }
    }
    with open("data/ingestion_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nDone. {success} posts saved, {failed} failed.")
    print(f"Summary → data/ingestion_summary.json")


if __name__ == "__main__":
    run_source1_ingestion(limit=40)