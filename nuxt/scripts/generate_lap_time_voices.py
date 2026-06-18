"""
generate_lap_time_voices.py
===========================
Genera WAV interi per l'annuncio dei tempi giro (PIP-155).

Range default:
    1:20.0 -> 2:30.9  (800 -> 1509 decimi totali)

Naming consumato da app/services/overlay/lapTimeAnnouncer.ts:
    lap-time-0800-if_sara.wav
    lap-time-1509-im_nicola.wav

Usage:
    python scripts/generate_lap_time_voices.py --voice if_sara \
      --from-tenths 900 --to-tenths 902 --force
    python scripts/generate_lap_time_voices.py --voice all --force
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
DEFAULT_SPEED = 1.2
MIN_TENTHS = 800
MAX_TENTHS = 1509

UNITS = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove"]
TEENS = [
    "dieci", "undici", "dodici", "tredici", "quattordici", "quindici",
    "sedici", "diciassette", "diciotto", "diciannove",
]
TENS = {2: "venti", 3: "trenta", 4: "quaranta", 5: "cinquanta"}


def italian_number(n: int) -> str:
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


def lap_time_text(tenths: int) -> str:
    total_seconds = tenths // 10
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    tenth = tenths % 10
    second_text = f"zero {italian_number(seconds)}" if seconds < 10 else italian_number(seconds)
    return f"{italian_number(minutes)}, {second_text}, punto {italian_number(tenth)}."


def lap_time_filename(tenths: int, voice: str) -> str:
    return f"lap-time-{tenths:04d}-{voice}.wav"


def main() -> None:  # noqa: C901
    parser = argparse.ArgumentParser(description="Generate full lap-time WAV files via Kokoro TTS.")
    parser.add_argument(
        "--voice",
        default="all",
        choices=["all", *VOICES],
        help="Voice to generate.",
    )
    parser.add_argument(
        "--from-tenths",
        type=int,
        default=MIN_TENTHS,
        help="First time in total tenths.",
    )
    parser.add_argument(
        "--to-tenths",
        type=int,
        default=MAX_TENTHS,
        help="Last time in total tenths.",
    )
    parser.add_argument("--speed", type=float, default=DEFAULT_SPEED, help="Kokoro speed.")
    parser.add_argument("--force", action="store_true", help="Re-generate existing WAV files.")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be generated.")
    args = parser.parse_args()

    if (
        args.from_tenths < MIN_TENTHS
        or args.to_tenths > MAX_TENTHS
        or args.from_tenths > args.to_tenths
    ):
        parser.error(f"Range must stay inside {MIN_TENTHS}..{MAX_TENTHS}.")
    if args.speed < 0.5 or args.speed > 2:
        parser.error("Speed must stay inside 0.5..2.")

    voices = VOICES if args.voice == "all" else [args.voice]
    items = [
        (tenths, voice)
        for voice in voices
        for tenths in range(args.from_tenths, args.to_tenths + 1)
    ]
    print(f"Output : {OUTPUT_DIR}")
    print(f"Total  : {len(items)} files")
    print(f"Speed  : {args.speed}\n")

    if args.dry_run:
        for tenths, voice in items[:20]:
            print(f"  [DRY] {lap_time_filename(tenths, voice)}  '{lap_time_text(tenths)}'")
        if len(items) > 20:
            print(f"  ... {len(items) - 20} more")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    runtime = KokoroRuntime()
    generated = skipped = errors = 0

    for tenths, voice in items:
        text = lap_time_text(tenths)
        out_path = OUTPUT_DIR / lap_time_filename(tenths, voice)
        if out_path.exists() and not args.force:
            skipped += 1
            continue
        try:
            out_path.write_bytes(runtime.synthesize(text, voice, args.speed))
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
