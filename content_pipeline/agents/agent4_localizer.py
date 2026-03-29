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
from functools import lru_cache

from langchain_core.messages import HumanMessage, SystemMessage

from content_pipeline.core import audit
from content_pipeline.core.llm_client import get_llm
from content_pipeline.core.settings import (
    SARVAM_MODEL_PATH,
    SARVAM_N_CTX,
    SARVAM_N_GPU_LAYERS,
)
from content_pipeline.core.state import ContentState


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


# ── Sarvam Translate via llama-cpp-python ─────────────────────────────────────

# Sarvam language codes
_SARVAM_LANG_CODES = {
    "hi": "hi-IN",
    "ta": "ta-IN",
    "mr": "mr-IN",
    "bn": "bn-IN",
    "te": "te-IN",
}


@lru_cache(maxsize=1)
def _get_sarvam_model():
    """
    Load the Sarvam GGUF model once and cache it.
    Separate from get_llm() — this is a translation-specific model instance.
    Returns None if SARVAM_MODEL_PATH is not configured.
    """
    if not SARVAM_MODEL_PATH:
        return None
    try:
        from llama_cpp import Llama  # type: ignore

        return Llama(
            model_path=SARVAM_MODEL_PATH,
            n_ctx=SARVAM_N_CTX,
            n_gpu_layers=SARVAM_N_GPU_LAYERS,
            verbose=False,
        )
    except ImportError:
        raise ImportError(
            "llama-cpp-python is not installed. Run: pip install llama-cpp-python"
        )
    except Exception as e:
        # Model file not found or corrupt — log and fall back to LLM-only
        print(
            f"[Sarvam] Could not load model: {e}. Falling back to LLM-only translation."
        )
        return None


def _translate_with_sarvam(text: str, target_lang: str) -> str:
    """
    Translate text using Sarvam Translate GGUF via llama-cpp-python.

    Sarvam uses a simple instruction format:
      Translate the following text to {language}: {text}

    Returns empty string if model is unavailable — the LLM post-processing
    step will then handle full translation by itself.
    """
    sarvam_lang = _SARVAM_LANG_CODES.get(target_lang)
    if not sarvam_lang:
        return ""  # unsupported language

    model = _get_sarvam_model()
    if model is None:
        return ""  # not configured — LLM fallback handles it

    lang_name = _LANGUAGE_META.get(target_lang, {}).get("name", target_lang)

    # Sarvam instruction prompt
    prompt = """<start_of_turn>user
Translate the following English text to {lang_name}:

{text}\n\n
<end_of_turn>
<start_of_turn>model
""".format(
        lang_name=lang_name, text=text
    )

    try:
        output = model(
            prompt,
            max_tokens=512,
            temperature=0.1,  # low temperature for translation — deterministic
            stop=["\n\n", "Text:", "English:"],
            echo=False,
        )
        translation = output["choices"][0]["text"].strip()
        return translation
    except Exception as e:
        print(f"[Sarvam] Translation failed for {target_lang}: {e}")
        return ""


# ── LLM post-processing ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a professional translator and localisation editor for a fintech company.
You ensure translated content reads naturally for native speakers while maintaining
financial accuracy and brand tone.
Always respond with valid JSON only. No preamble, no markdown fences.
"""

_POSTPROCESS_PROMPT = """\
<original_english>
{original}
</original_english>

<machine_translation>
{machine_translation}
</machine_translation>

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
{task_instruction}

Check and fix:
1. Does it read naturally for a native {language_name} speaker?
2. Are fintech terms transliterated correctly (not literally translated)?
3. Are official disclaimer translations used verbatim where applicable?
4. Does the tone match the original (professional, direct)?

Return JSON:
{{
  "translated_text": "the final localised content",
  "changes_made": "brief note on what was corrected"
}}
</task>
"""

_REFINE_TASK = (
    "A machine translation is provided above. Review and improve it. "
    "Fix naturalness, terminology, and disclaimer translations."
)

_TRANSLATE_FROM_SCRATCH_TASK = (
    "No machine translation is available. "
    "Translate the original English text into {language_name} directly."
)


def _postprocess_with_llm(
    original: str,
    machine_translation: str,
    target_lang: str,
    llm,
) -> str:
    """
    LLM post-processing pass.
    If machine_translation is empty (Sarvam unavailable), does full translation.
    If machine_translation is present, refines it.
    """
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
        or "No official translations stored for this language yet."
    )

    task_instruction = (
        _REFINE_TASK
        if machine_translation
        else _TRANSLATE_FROM_SCRATCH_TASK.format(language_name=lang_meta["name"])
    )

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(
            content=_POSTPROCESS_PROMPT.format(
                original=original,
                machine_translation=machine_translation or "(not available)",
                language_name=lang_meta["name"],
                native_name=lang_meta["native_name"],
                fintech_note=lang_meta["fintech_note"],
                official_disclaimers=official_disclaimers_str,
                task_instruction=task_instruction,
            )
        ),
    ]

    response = llm.invoke(messages)
    raw = response.content.strip()
    raw = re.sub(r"^```(?:json)?", "", raw).rstrip("```").strip()

    try:
        parsed = json.loads(raw)
        return parsed.get("translated_text", raw)
    except json.JSONDecodeError:
        return raw


# ── Node function ─────────────────────────────────────────────────────────────


def agent4_localizer(state: ContentState) -> ContentState:
    """
    LangGraph node — Agent 4: Localizer.

    For each target language:
      1. Sarvam Translate (GGUF, local) → fast first-pass translation
      2. Main LLM refines for naturalness, terminology, official disclaimers

    If Sarvam model is not configured, step 2 handles full translation.
    English is always included as-is.
    """
    llm = get_llm()
    draft = state.get("current_draft", "")
    target_languages = state.get("target_languages", [])
    localized: dict[str, str] = {"en": draft}

    for lang in target_languages:
        if lang == "en":
            continue

        # Step 1: Sarvam machine translation
        machine_translation = _translate_with_sarvam(draft, lang)

        # Step 2: LLM refinement (or full translation if Step 1 returned empty)
        final = _postprocess_with_llm(
            original=draft,
            machine_translation=machine_translation,
            target_lang=lang,
            llm=llm,
        )
        localized[lang] = final

    sarvam_available = _get_sarvam_model() is not None
    print("Localisation Done.")
    pprint.pprint(
        {
            **state,
            "localized_versions": localized,
            "audit_trail": audit.append(
                state["audit_trail"],
                audit.make_entry(
                    run_id=state["run_id"],
                    agent="agent4_localizer",
                    action="localization_complete",
                    decision="pass",
                    detail={
                        "languages_processed": list(localized.keys()),
                        "sarvam_used": sarvam_available,
                        "fallback_to_llm_only": not sarvam_available,
                    },
                ),
            ),
        }
    )
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
                detail={
                    "languages_processed": list(localized.keys()),
                    "sarvam_used": sarvam_available,
                    "fallback_to_llm_only": not sarvam_available,
                },
            ),
        ),
    }
