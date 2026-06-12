"""
generate_step_voices.py
=======================
Generates WAV files for the overlay voice system from the single voice script
(app/config/voiceScript.json — the only source of truth, PIP-98).

WAV filenames:
    step-{trainingId}-{modeId}-{stepId}-{voice}.wav   <- step intros
    {scenarioId}-{voice}.wav                          <- scenario cues

The composite path matches what useSessionOrchestrator passes to
enqueueStepStart() (`${trainingId}-${modeId}`, stepId).

Usage (Kokoro model + voices must be available locally):
    python nuxt/scripts/generate_step_voices.py [--force]

    --force   Re-generate even if the WAV file already exists.

Run from the repo root or from the nuxt/ folder.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# ─── Resolve paths ────────────────────────────────────────────────────────────
THIS = Path(__file__).resolve()
NUXT_ROOT = THIS.parent.parent
SCRIPTS_DIR = THIS.parent
OUTPUT_DIR = NUXT_ROOT / "public" / "voice" / "qualifying"
VOICE_SCRIPT = NUXT_ROOT / "app" / "config" / "voiceScript.json"

sys.path.insert(0, str(SCRIPTS_DIR))
from kokoro_tts_server import KokoroRuntime  # noqa: E402


def wav_filename(training_id: str, mode_id: str, step_id: str, voice: str) -> str:
    """Return the output filename for a given phrase + voice combination."""
    if not training_id:
        return f"{step_id}-{voice}.wav"
    return f"step-{training_id}-{mode_id}-{step_id}-{voice}.wav"


def load_phrases() -> tuple[list[tuple[str, str, str, str, float | None]], dict]:
    data = json.loads(VOICE_SCRIPT.read_text(encoding="utf-8"))
    phrases: list[tuple[str, str, str, str, float | None]] = []
    for scenario in data.get("scenarios", []):
        phrases.append(("", "", scenario["id"], scenario["text"], scenario.get("speed")))
    for step in data.get("steps", []):
        phrases.append((
            step["trainingId"], step["modeId"], step["stepId"],
            step["text"], step.get("speed"),
        ))
    return phrases, data


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate overlay voice WAV files from voiceScript.json via Kokoro TTS."
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-generate WAV files even if they already exist."
    )
    args = parser.parse_args()

    phrases, data = load_phrases()
    voices = data.get("voices", ["if_sara", "im_nicola"])
    default_speed = float(data.get("defaultSpeed", 1.15))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    runtime = KokoroRuntime()

    total = len(phrases) * len(voices)
    generated = skipped = errors = 0

    print(f"Voice script : {VOICE_SCRIPT}")
    print(f"Output       : {OUTPUT_DIR}")
    print(f"Voices       : {', '.join(voices)}")
    print(f"Total        : {total} files\n")

    for training_id, mode_id, step_id, text, speed in phrases:
        for voice in voices:
            filename = wav_filename(training_id, mode_id, step_id, voice)
            out_path = OUTPUT_DIR / filename

            if out_path.exists() and not args.force:
                print(f"  [SKIP] {filename}")
                skipped += 1
                continue

            try:
                wav_bytes = runtime.synthesize(text, voice, speed or default_speed)
                out_path.write_bytes(wav_bytes)
                label = f"{training_id}/{mode_id}/{step_id}" if training_id else step_id
                print(f"  [OK]   {filename}")
                print(f"         [{label}] '{text[:68]}'")
                generated += 1
            except Exception as exc:
                print(f"  [ERR]  {filename}: {exc}", file=sys.stderr)
                errors += 1

    # ASCII puro: la console Windows in cp1252 non codifica i box-drawing.
    print(f"\n{'-' * 64}")
    print(f"Generated : {generated}")
    print(f"Skipped   : {skipped}  (use --force to regenerate)")
    print(f"Errors    : {errors}")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
