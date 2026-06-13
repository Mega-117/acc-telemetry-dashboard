"""
generate_spotter_bricks.py  (PIP-103)
=====================================
Genera i WAV "mattoncini" dello spotter a frammenti, concatenati a runtime da
app/composables/useSpotterVoice.ts (stile lap-time, PIP-101). Fonte unica:
  app/config/spotterPhrases.json  -> template (chiavi x varianti, slot)
  app/config/spotterSlots.json    -> valori finiti di {delta} e {sector}

Lo split dei template e la pulizia delle parti letterali sono IDENTICI a
app/services/spotter/spotterBricks.ts (tokenizeSpotterTemplate/cleanChunk), così
gli id combaciano: lit-{key}-{variante}-{indiceParte}.

Nomi file (consumati da spotterBricks.ts -> spotterBrickPath):
    sp-{brickId}-{voice}.wav

Uso (Kokoro deve essere disponibile localmente):
    python nuxt/scripts/generate_spotter_bricks.py [--force]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

THIS = Path(__file__).resolve()
NUXT_ROOT = THIS.parent.parent
SCRIPTS_DIR = THIS.parent
CONFIG_DIR = NUXT_ROOT / "app" / "config"
OUTPUT_DIR = NUXT_ROOT / "public" / "voice" / "spotter"
PHRASES_JSON = CONFIG_DIR / "spotterPhrases.json"
SLOTS_JSON = CONFIG_DIR / "spotterSlots.json"

sys.path.insert(0, str(SCRIPTS_DIR))
from kokoro_tts_server import KokoroRuntime  # noqa: E402

SLOT_SPLIT_RE = re.compile(r"(\{delta\}|\{sector\})")


def clean_chunk(part: str) -> str:
    """Via spazi/punteggiatura iniziali, spazi finali (= cleanChunk in TS)."""
    return re.sub(r"\s+$", "", re.sub(r"^[\s.,;:]+", "", part))


def collect_bricks(phrases: dict, slots: dict) -> dict[str, str]:
    """Manifest id -> testo: parti letterali + valori delta/settore."""
    out: dict[str, str] = {}
    for key, variants in phrases.items():
        for variant_index, template in enumerate(variants):
            for index, part in enumerate(SLOT_SPLIT_RE.split(template)):
                if part in ("{delta}", "{sector}"):
                    continue
                text = clean_chunk(part)
                if text:
                    out[f"lit-{key}-{variant_index}-{index}"] = text
    for slot_id, text in slots.get("deltas", {}).items():
        out[f"delta-{slot_id}"] = text
    for slot_id, text in slots.get("sectors", {}).items():
        out[f"sector-{slot_id}"] = text
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate spotter WAV bricks via Kokoro TTS.")
    parser.add_argument("--force", action="store_true", help="Re-generate even if files exist.")
    args = parser.parse_args()

    phrases = json.loads(PHRASES_JSON.read_text(encoding="utf-8"))
    slots = json.loads(SLOTS_JSON.read_text(encoding="utf-8"))
    voices = slots.get("voices", ["if_sara", "im_nicola"])
    speed = float(slots.get("defaultSpeed", 1.08))

    bricks = collect_bricks(phrases, slots)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    runtime = KokoroRuntime()

    total = len(bricks) * len(voices)
    generated = skipped = errors = 0
    print(f"Output : {OUTPUT_DIR}")
    print(f"Bricks : {len(bricks)}  Voices: {', '.join(voices)}  Total: {total}\n")

    for brick_id, text in sorted(bricks.items()):
        for voice in voices:
            out_path = OUTPUT_DIR / f"sp-{brick_id}-{voice}.wav"
            if out_path.exists() and not args.force:
                skipped += 1
                continue
            try:
                out_path.write_bytes(runtime.synthesize(text, voice, speed))
                print(f"  [OK]   {out_path.name}  '{text}'")
                generated += 1
            except Exception as exc:
                print(f"  [ERR]  {out_path.name}: {exc}", file=sys.stderr)
                errors += 1

    print(f"\nGenerated : {generated}")
    print(f"Skipped   : {skipped}  (use --force to regenerate)")
    print(f"Errors    : {errors}")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
