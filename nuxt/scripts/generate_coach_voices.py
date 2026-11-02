"""
generate_coach_voices.py
========================
Genera i WAV delle frasi coach (PIP-257) da app/config/coachVoiceScript.json
(fonte di verita' unica) con Kokoro ONNX, per le voci Sara e Nicola.

Regola bloccante: ogni frase deve avere ALMENO 3 parole (Kokoro distorce i
testi corti — vincolo utente, coerente con PIP-144). Lo script FALLISCE se
una frase e' troppo corta: nessuna traccia degradata puo' nascere.

Output: public/voice/coach/<key>-<voice>.wav
(consumati da /voice/coach/... come gli altri avvisi: arrivano anche nel programma
installato con i file della webapp, PIP-667).

Uso (funziona anche con l'interprete embedded del runtime Kokoro):
    set ACC_KOKORO_ONNX_MODEL=<path kokoro-v1.0.onnx>
    set ACC_KOKORO_ONNX_VOICES=<path voices-v1.0.bin>
    python nuxt/scripts/generate_coach_voices.py [--force]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import wave
from pathlib import Path

THIS = Path(__file__).resolve()
NUXT_ROOT = THIS.parent.parent
SCRIPT_JSON = NUXT_ROOT / "app" / "config" / "coachVoiceScript.json"
OUTPUT_DIR = NUXT_ROOT / "public" / "voice" / "coach"

MIN_WORDS = 3
SAMPLE_RATE = 24_000
sys.path.insert(0, str(THIS.parent))
from voice_language import ALL_VOICES, kokoro_lang, text_for  # noqa: E402


def validate_phrases(phrases: list[dict]) -> list[str]:
    errors = []
    for phrase in phrases:
        # PIP-667: the English text follows the same rule as the Italian one.
        for field in ("text", "textEn"):
            text = str(phrase.get(field, ""))
            words = [w for w in text.replace(",", " ").split() if w]
            if len(words) < MIN_WORDS:
                errors.append(
                    f"  '{phrase.get('key')}' {field}: \"{text}\" "
                    f"({len(words)} parole, minimo {MIN_WORDS})"
                )
    return errors


def write_wav(path: Path, samples, sample_rate: int) -> None:
    import numpy as np
    pcm = (np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera i WAV coach da coachVoiceScript.json")
    parser.add_argument("--force", action="store_true", help="rigenera anche i WAV esistenti")
    parser.add_argument("--voices", default="", help="voci da generare, separate da virgola")
    args = parser.parse_args()

    data = json.loads(SCRIPT_JSON.read_text(encoding="utf-8"))
    phrases = data["phrases"]
    parser_voices = [v for v in args.voices.split(",") if v]
    voices = parser_voices or data.get("voices", ALL_VOICES)
    speed = float(data.get("defaultSpeed", 1.15))

    errors = validate_phrases(phrases)
    if errors:
        print("ERRORE: frasi sotto il minimo di parole (regola Kokoro):")
        print("\n".join(errors))
        return 1

    model_path = os.environ.get("ACC_KOKORO_ONNX_MODEL", "")
    voices_path = os.environ.get("ACC_KOKORO_ONNX_VOICES", "")
    if not (
        model_path and Path(model_path).exists() and voices_path and Path(voices_path).exists()
    ):
        print("ERRORE: impostare ACC_KOKORO_ONNX_MODEL e ACC_KOKORO_ONNX_VOICES")
        return 1

    from kokoro_onnx import Kokoro
    model = Kokoro(model_path, voices_path)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    generated = skipped = 0
    for phrase in phrases:
        for voice in voices:
            out = OUTPUT_DIR / f"{phrase['key']}-{voice}.wav"
            if out.exists() and not args.force:
                skipped += 1
                continue
            samples, sample_rate = model.create(
                text_for(phrase, voice), voice=voice, speed=float(phrase.get("speed", speed)),
                lang=kokoro_lang(voice),
            )
            write_wav(out, samples, int(sample_rate or SAMPLE_RATE))
            generated += 1
            print(f"  ok {out.name}")

    print(f"Generati {generated}, saltati {skipped}, totale attesi {len(phrases) * len(voices)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
