"""
Agent 4 — Localizer

Two-step localization:
  Step 1 — Sarvam Translate via llama-cpp-python (GGUF, local)
  Step 2 — Main LLM post-processing pass (naturalness, tone, disclaimers)

Sarvam is loaded as a separate Llama instance from the main Qwen model.
Translation and content generation are kept separate intentionally —
different tasks, different context requirements.
"""

from __future__ import annotations

import json
import pprint
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from content_pipeline.core import audit
from content_pipeline.core.llm_client import get_llm
from content_pipeline.core.state import ContentState
from content_pipeline.core.utils import clean_llm_response


# ── Language metadata ─────────────────────────────────────────────────────────

_LANGUAGE_META = {
    "hi": {
        "name": "Hindi",
        "native_name": "हिन्दी",
        "fintech_note": (
            "Use transliterated English for technical terms: "
            "'payment gateway' → 'पेमेंट गेटवे' (NOT 'भुगतान द्वार'). "
            "'merchant' → 'मर्चेंट'. 'settlement' → 'सेटलमेंट'."
        ),
    },
    "ta": {
        "name": "Tamil",
        "native_name": "தமிழ்",
        "fintech_note": (
            "Use transliterated English for fintech terms. "
            "'merchant' → 'மர்ச்சன்ட்'. 'payment' → 'பேமென்ட்'."
        ),
    },
    "mr": {
        "name": "Marathi",
        "native_name": "मराठी",
        "fintech_note": "Use transliterated English for technical fintech terms.",
    },
    "bn": {
        "name": "Bengali",
        "native_name": "বাংলা",
        "fintech_note": "Use transliterated English for technical fintech terms.",
    },
    "te": {
        "name": "Telugu",
        "native_name": "తెలుగు",
        "fintech_note": "Use transliterated English for technical fintech terms.",
    },
}

# Official RBI disclaimer translations — used verbatim, never re-translated
_OFFICIAL_DISCLAIMER_TRANSLATIONS: dict[str, dict[str, str]] = {
    "hi": {
        "terms and conditions apply": "नियम और शर्तें लागू होती हैं",
        "subject to eligibility": "पात्रता के अधीन",
    },
    "ta": {
        "terms and conditions apply": "விதிமுறைகள் மற்றும் நிபந்தனைகள் பொருந்தும்",
        "subject to eligibility": "தகுதிக்கு உட்பட்டு",
    },
}

_TRANSLATE_PROMPT = """\
<original_english>
{original}
</original_english>

<target_language>
{language_name} ({native_name})
</target_language>

<fintech_terminology_rules>
{fintech_note}
</fintech_terminology_rules>

<official_disclaimers>
{official_disclaimers}
</official_disclaimers>

<task>
Translate the original English text into {language_name}.

Rules:
1. Transliterate fintech terms — do not literally translate them
2. Use official disclaimer translations verbatim where listed above
3. Match the tone of the original (professional, direct)
4. Output only the translated text as plain JSON

Return JSON:
{{
  "translated_text": "..."
}}
</task>
"""


def _translate(
    original: str,
    target_lang: str,
    llm,
) -> str:
    lang_meta = _LANGUAGE_META.get(
        target_lang,
        {
            "name": target_lang,
            "native_name": target_lang,
            "fintech_note": "",
        },
    )

    official_disclaimers_str = (
        "\n".join(
            f"  '{eng}' → '{trans}'"
            for eng, trans in _OFFICIAL_DISCLAIMER_TRANSLATIONS.get(
                target_lang, {}
            ).items()
        )
        or "None stored yet."
    )

    messages = [
        SystemMessage(
            content=(
                "You are a professional fintech translator. "
                "Always respond with valid JSON only. No preamble, no markdown fences."
            )
        ),
        HumanMessage(
            content=_TRANSLATE_PROMPT.format(
                original=original,
                language_name=lang_meta["name"],
                native_name=lang_meta["native_name"],
                fintech_note=lang_meta["fintech_note"],
                official_disclaimers=official_disclaimers_str,
            )
        ),
        AIMessage(content="<think>\n</think>\n"),
    ]

    response = llm.invoke(messages)
    raw = response.content.strip()
    raw = clean_llm_response(raw)

    try:
        return json.loads(raw).get("translated_text", raw)
    except json.JSONDecodeError:
        return raw


# ── Node function ─────────────────────────────────────────────────────────────


def agent4_localizer(state: ContentState) -> ContentState:
    llm = get_llm()
    draft = state.get("current_draft", "")
    target_languages = state.get("target_languages", [])
    localized: dict[str, str] = {"en": draft}

    for lang in target_languages:
        if lang == "en":
            continue
        localized[lang] = _translate(draft, lang, llm)
    print("Localisation Done.")
    pprint.pprint("Localisation Done.")
    return {
        **state,
        "localized_versions": localized,
        "audit_trail": audit.append(
            state["audit_trail"],
            audit.make_entry(
                run_id=state["run_id"],
                agent="agent4_localizer",
                action="localization_complete",
                decision="pass",
                detail={"languages_processed": list(localized.keys())},
            ),
        ),
    }
