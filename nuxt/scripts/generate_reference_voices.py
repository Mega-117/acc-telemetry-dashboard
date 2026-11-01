"""
generate_reference_voices.py  (PIP-667)
=======================================
Generates the WAVs of the shipped track references (server/data/track-voice-points.defaults.json)
for the voices asked, reading the text of each voice's language (text / text_en), and records the
paths in the defaults file. The WAV goes next to the existing ones of the point
(public/voice/references/<track>/<id>-<voice>.wav).

The program ships its own copy in desktop-app/runtime/data/voice_audio/references/: copy the new
files there too (see the release checklist).

Usage:
    python scripts/generate_reference_voices.py --voices af_heart,am_michael [--force]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

THIS = Path(__file__).resolve()
NUXT_ROOT = THIS.parent.parent
DEFAULTS = NUXT_ROOT / "server" / "data" / "track-voice-points.defaults.json"
PUBLIC = NUXT_ROOT / "public"

sys.path.insert(0, str(THIS.parent))
from kokoro_tts_server import KokoroRuntime  # noqa: E402
from voice_language import ALL_VOICES, text_for  # noqa: E402


def reference_folder(point: dict) -> str:
    """Web folder of the point's existing WAVs, e.g. /voice/references/spa."""
    for path in (point.get("audio_paths") or {}).values():
        if path.startswith("/voice/references/"):
            return path.rsplit("/", 1)[0]
    return f"/voice/references/{str(point['track']).strip().lower()}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate shipped track reference WAVs per voice.")
    parser.add_argument("--voices", default=",".join(ALL_VOICES))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    voices = [v for v in args.voices.split(",") if v]
    unknown = [v for v in voices if v not in ALL_VOICES]
    if unknown:
        parser.error(f"unknown voices: {unknown}")

    raw = DEFAULTS.read_text(encoding="utf-8")
    store = json.loads(raw)
    runtime = KokoroRuntime()
    generated = skipped = 0
    for point in store["points"]:
        folder = reference_folder(point)
        for voice in voices:
            web_path = f"{folder}/{point['id']}-{voice}.wav"
            out = PUBLIC / web_path.lstrip("/")
            if not out.exists() or args.force:
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(runtime.synthesize(text_for(point, voice, "text_en"), voice, float(point.get("speed") or 1.15)))
                generated += 1
                print(f"  ok {out.name}")
            else:
                skipped += 1
            point.setdefault("audio_paths", {})[voice] = web_path
    DEFAULTS.write_text(json.dumps(store, indent=2, ensure_ascii=False) + ("\n" if raw.endswith("\n") else ""), encoding="utf-8")
    print(f"Generated {generated}, skipped {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
