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
import os
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from content_pipeline.core import audit
from content_pipeline.core.llm_client import get_llm
from content_pipeline.core.state import ContentState
from content_pipeline.core.utils import clean_llm_response

try:
    from content_pipeline.tools.image_templates import (
        IMAGE_OUTPUT_DIR,
        SUPPORTED_PLATFORMS,
        render_image,
    )
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False
    SUPPORTED_PLATFORMS = set()


# ── Headline extraction ────────────────────────────────────────────────────────

_HEADLINE_SYSTEM = (
    "You extract short, punchy image card headlines. "
    "Always respond with valid JSON only. No preamble, no markdown fences."
)

_HEADLINE_PROMPT = """\
<draft>
{draft}
</draft>

Extract a single headline (≤10 words) that captures the strongest message
in this content and works as bold text on a social media image card.

Rules:
- No hashtags, no emojis, no punctuation at the end
- Active voice, present tense
- Do NOT include the company name

Return JSON:
{{
  "headline": "the headline text"
}}
"""


def _extract_headline(draft: str, llm) -> str:
    messages = [
        SystemMessage(content=_HEADLINE_SYSTEM),
        HumanMessage(content=_HEADLINE_PROMPT.format(draft=draft[:1500])),
        AIMessage(content="<think>\n</think>\n"),
    ]
    response = llm.invoke(messages)
    raw = clean_llm_response(response.content.strip())
    try:
        return json.loads(raw).get("headline", "")
    except json.JSONDecodeError:
        # Fall back: first sentence of draft, capped at 10 words
        words = draft.split()[:10]
        return " ".join(words)


# ── Brand color extraction ─────────────────────────────────────────────────────


def _brand_colors(
    profile: dict, platform: str
) -> tuple[tuple[int, int, int], tuple[int, int, int]] | None:
    """
    Pull optional brand_colors from company profile.
    Expected format in profile:
      "brand_colors": {"primary": "#0077B5", "secondary": "#00A0DC"}
    Returns (top_rgb, bottom_rgb) or None to use platform defaults.
    """
    colors = profile.get("brand_colors")
    if not colors:
        return None
    try:
        def _hex(h: str) -> tuple[int, int, int]:
            h = h.lstrip("#")
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
        return (_hex(colors["primary"]), _hex(colors["secondary"]))
    except (KeyError, ValueError):
        return None


# ── LangGraph node ─────────────────────────────────────────────────────────────


def agent6_image_generator(state: ContentState) -> ContentState:
    """
    LangGraph node — Agent 6: Image Generator.

    Generates platform-specific image cards for all confirmed platforms
    that support images (twitter, linkedin, instagram).
    """
    print("Starting Image Generation.")

    if not _PIL_AVAILABLE:
        print("  [image_generator] Pillow not installed — skipping image generation.")
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
                    detail={"reason": "Pillow not installed"},
                ),
            ),
        }

    confirmed_platforms: list[str] = state.get("confirmed_platforms", [])
    # Fall back to the primary channel if confirmed_platforms not set yet
    if not confirmed_platforms and state.get("channel"):
        confirmed_platforms = [state["channel"]]

    target_platforms = [p for p in confirmed_platforms if p in SUPPORTED_PLATFORMS]

    if not target_platforms:
        print("  [image_generator] No image-capable platforms in confirmed_platforms — skipping.")
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
    headline = _extract_headline(draft, llm)
    print(f"  [image_generator] Headline: {headline!r}")

    generated: dict[str, str] = {}
    failed: list[str] = []

    for platform in target_platforms:
        try:
            output_path = IMAGE_OUTPUT_DIR / f"{run_id}_{platform}.png"
            colors = _brand_colors(profile, platform)
            render_image(
                platform=platform,
                headline=headline,
                company_name=company_name,
                output_path=output_path,
                brand_colors=colors,
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
                    "headline": headline,
                    "platforms_generated": list(generated.keys()),
                    "platforms_failed": failed,
                    "paths": generated,
                },
            ),
        ),
    }
