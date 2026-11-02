"""
voice_language.py  (PIP-667)
============================
Which text a voice reads. Twin of app/config/voiceCatalog.ts: Sara/Nicola read the Italian text,
Heart/Michael the English one. A missing English text is an error, never an Italian text read by an
English voice.
"""

from __future__ import annotations

ALL_VOICES = ["if_sara", "im_nicola", "af_heart", "am_michael"]
ENGLISH_VOICES = {"af_heart", "am_michael"}


def is_english(voice: str) -> bool:
    return voice in ENGLISH_VOICES


def kokoro_lang(voice: str) -> str:
    return "en-us" if is_english(voice) else "it"


def text_for(entry: dict, voice: str, english_key: str = "textEn",
             italian_key: str = "text") -> str:
    """The text `voice` reads for this entry; raises when the English text is missing."""
    if not is_english(voice):
        return str(entry[italian_key])
    text = str(entry.get(english_key) or "").strip()
    if not text:
        name = entry.get('id') or entry.get('key') or entry.get('stepId')
        raise ValueError(f"missing English text ({english_key}) for {name}")
    return text
