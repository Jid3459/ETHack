"""
Agent 6 — Image Generator

For every confirmed platform that supports image cards (twitter, linkedin,
instagram), generates a branded image at the platform's standard aspect ratio.

Flow:
  1. LLM extracts a ≤10-word punchy headline from the approved draft.
  2. PIL renders a templated image card (gradient bg + text overlay + branding).
  3. Images are saved to disk; file paths written to state["generated_images"].

Reads from state:  current_draft, confirmed_platforms, company_profile, run_id
Writes to state:   generated_images  {platform → absolute file path}

Skips silently if:
  - Pillow is not installed
  - No confirmed platform overlaps with SUPPORTED_PLATFORMS
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from content_pipeline.tools.image_generation.image_generator import (
    BRAND_IMAGES_DIR,
)
from content_pipeline.core import audit
from content_pipeline.core.llm_client import get_llm
from content_pipeline.core.state import ContentState
from content_pipeline.core.utils import clean_llm_response

try:
    from content_pipeline.tools.image_generation.image_generator import (
        IMAGE_OUTPUT_DIR,
        SUPPORTED_PLATFORMS,
        render_image,
    )

    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False
    SUPPORTED_PLATFORMS = set()


# ── Headline extraction ────────────────────────────────────────────────────────

_INFO_SYSTEM = (
    "You extract headlines, the main text and a click-to-action tag for social media posts "
    "Always respond with valid JSON only. No preamble, no markdown fences."
)

_INFO_PROMPT_INSTAGRAM = """\
<draft>
{draft}
</draft>

Extract content suitable for an Instagram social media image card:

1. **Headline** (≤10 words):  
   - Captures the strongest message  
   - Bold, punchy, active voice, present tense  
   - No hashtags, emojis, or punctuation at the end  
   - Do NOT include the company name

2. **Subtext** (≤40 words):  
   - Explains the key message clearly  
   - Provides context so viewers understand what the post is about  
   - Informative and readable on Instagram  
   - Can include key benefits or highlights, but keep concise

3. **CTA** (≤6 words):  
   - Clear call-to-action encouraging user engagement  
   - Examples: "Get Started", "Learn More", "Sign Up Now"  
   - Short, actionable, no punctuation

Return JSON in this exact format:

{{
  "headline": "the headline text",
  "subtext": "the subtext text",
  "cta": "the CTA text"
}}
"""
_INFO_PROMPT_LINKEDIN = """\
<draft>
{draft}
</draft>

Extract content suitable for a LinkedIn social media post card:

1. **Headline** (≤12 words):  
   - Captures the core professional insight or value  
   - Clear, compelling, and authoritative tone  
   - Use active voice and present tense  
   - No emojis or hashtags  
   - Do NOT include the company name  

2. **Subtext** (≤60 words):  
   - Explains the key message with clarity and professional context  
   - Highlights insights, outcomes, or business value  
   - Informative, concise, and easy to read for a professional audience  
   - May include key benefits, data points, or takeaways  

3. **CTA** (≤8 words):  
   - Clear and professional call-to-action  
   - Encourages engagement or next steps  
   - Examples: "Learn More", "Explore Insights", "Read the Full Report"  
   - No emojis or punctuation  

Return JSON in this exact format:

{{
  "headline": "the headline text",
  "subtext": "the subtext text",
  "cta": "the CTA text"
}}
"""


def _extract_information(draft: str, llm, platform) -> dict[str, Any]:
    messages = [
        SystemMessage(content=_INFO_SYSTEM),
        HumanMessage(content=_INFO_PROMPT_INSTAGRAM.format(draft=draft[:1500])),
    ]
    if platform == "instagram":
        messages = [
            SystemMessage(content=_INFO_SYSTEM),
            HumanMessage(content=_INFO_PROMPT_INSTAGRAM.format(draft=draft[:1500])),
        ]
    elif platform == "linkedin":
        messages = [
            SystemMessage(content=_INFO_SYSTEM),
            HumanMessage(content=_INFO_PROMPT_LINKEDIN.format(draft=draft[:1500])),
        ]
    response = llm.invoke(messages)
    raw = clean_llm_response(response.content.strip())
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fall back: first sentence of draft, capped at 10 words
        words = draft.split()[:10]
        return " ".join(words)


# ── LangGraph node ─────────────────────────────────────────────────────────────


def agent6_image_generator(state: ContentState) -> ContentState:
    """
    LangGraph node — Agent 6: Image Generator.

    Generates platform-specific image cards for all confirmed platforms
    that support images (twitter, linkedin, instagram).
    """
    print("Starting Image Generation.")

    confirmed_platforms: list[str] = state.get("confirmed_platforms", [])
    if not confirmed_platforms and state.get("channel"):
        confirmed_platforms = [state["channel"]]
    target_platforms = [p for p in confirmed_platforms if p in SUPPORTED_PLATFORMS]

    if not target_platforms:
        print(
            "  [image_generator] No image-capable platforms in confirmed_platforms — skipping."
        )
        return {
            **state,
            "generated_images": {},
            "audit_trail": audit.append(
                state["audit_trail"],
                audit.make_entry(
                    run_id=state["run_id"],
                    agent="agent6_image_generator",
                    action="skipped",
                    decision="skip",
                    detail={"confirmed_platforms": confirmed_platforms},
                ),
            ),
        }

    llm = get_llm()
    draft = state.get("current_draft", "")
    profile = state.get("company_profile") or {}
    company_name = profile.get("name", state.get("company_id", ""))
    run_id = state["run_id"]

    # Extract one headline for all platforms (same approved draft)

    generated: dict[str, str] = {}
    failed: list[str] = []

    for platform in target_platforms:
        data = _extract_information(draft, llm, platform)
        try:
            output_path = IMAGE_OUTPUT_DIR / f"{run_id}_{platform}.png"
            image_data = json.load(
                open(Path(BRAND_IMAGES_DIR) / company_name.lower() / "image_data.json")
            )
            data["logo"] = f"brand_images/{company_name.lower()}/{image_data["logo"]}"
            data["background_image"] = (
                f"brand_images/{company_name.lower()}/{image_data[f"{platform}_bg"]}"
            )

            if "brand_colors" not in profile:
                data["brand_colors"] = {"primary": "#000", "secondary": "#000"}
            data["brand_colors"] = profile["brand_colors"]
            render_image(
                platform=platform,
                data=data,
                company_name=company_name,
                output_path=output_path,
            )
            generated[platform] = str(output_path)
            print(f"  [image_generator] Saved {platform} image → {output_path}")
        except Exception as exc:
            print(f"  [image_generator] ERROR generating {platform} image: {exc}")
            failed.append(platform)

    print(f"Image Generation Complete. Generated: {list(generated.keys())}")

    return {
        **state,
        "generated_images": generated,
        "audit_trail": audit.append(
            state["audit_trail"],
            audit.make_entry(
                run_id=state["run_id"],
                agent="agent6_image_generator",
                action="images_generated",
                decision="pass" if generated else "fail",
                detail={
                    "data": data,
                    "platforms_generated": list(generated.keys()),
                    "platforms_failed": failed,
                    "paths": generated,
                },
            ),
        ),
    }
