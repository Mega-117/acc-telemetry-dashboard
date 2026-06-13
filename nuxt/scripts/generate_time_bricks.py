"""
generate_time_bricks.py
=======================
Generates the WAV "bricks" used to announce lap times by concatenation
(PIP-101): numbers 0-59 as whole Italian words, the conjunction "e" and the
"giro non valido" prefix, for both Kokoro voices.

Filenames (consumed by app/services/overlay/lapTimeAnnouncer.ts):
    time-num-{0..59}-{voice}.wav
    time-e-{voice}.wav
    time-invalid-{voice}.wav

Usage:
    python nuxt/scripts/generate_time_bricks.py [--force]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

THIS = Path(__file__).resolve()
NUXT_ROOT = THIS.parent.parent
SCRIPTS_DIR = THIS.parent
OUTPUT_DIR = NUXT_ROOT / "public" / "voice" / "qualifying"

sys.path.insert(0, str(SCRIPTS_DIR))
from kokoro_tts_server import KokoroRuntime  # noqa: E402

VOICES = ["if_sara", "im_nicola"]
SPEED = 1.15

UNITS = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove"]
TEENS = [
    "dieci", "undici", "dodici", "tredici", "quattordici", "quindici",
    "sedici", "diciassette", "diciotto", "diciannove",
]
TENS = {2: "venti", 3: "trenta", 4: "quaranta", 5: "cinquanta"}


def italian_number(n: int) -> str:
    """0-59 come parola intera (elisione per uno/otto: ventuno, trentotto)."""
    if n < 10:
        return UNITS[n]
    if n < 20:
        return TEENS[n - 10]
    tens_word = TENS[n // 10]
    unit = n % 10
    if unit == 0:
        return tens_word
    if unit in (1, 8):
        return tens_word[:-1] + UNITS[unit]
    return tens_word + UNITS[unit]


def bricks() -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = [(f"num-{n}", italian_number(n)) for n in range(60)]
    out.append(("e", "e"))
    out.append(("invalid", "giro non valido."))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate lap-time WAV bricks via Kokoro TTS.")
    parser.add_argument("--force", action="store_true", help="Re-generate even if files exist.")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    runtime = KokoroRuntime()

    items = bricks()
    total = len(items) * len(VOICES)
    generated = skipped = errors = 0
    print(f"Output : {OUTPUT_DIR}")
    print(f"Total  : {total} files\n")

    for brick_id, text in items:
        for voice in VOICES:
            out_path = OUTPUT_DIR / f"time-{brick_id}-{voice}.wav"
            if out_path.exists() and not args.force:
                skipped += 1
                continue
            try:
                out_path.write_bytes(runtime.synthesize(text, voice, SPEED))
                print(f"  [OK]   {out_path.name}  '{text}'")
                generated += 1
            except Exception as exc:
                print(f"  [ERR]  {out_path.name}: {exc}", file=sys.stderr)
                errors += 1

    print(f"\nGenerated : {generated}")
    print(f"Skipped   : {skipped}")
    print(f"Errors    : {errors}")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
