"""
generate_step_voices.py
=======================
Generates WAV files for all training-step voice intros and the generic stepEnd cue.

WAV filenames:
    step-{trainingId}-{modeId}-{stepId}-{voice}.wav   ← step intros
    stepEnd-{voice}.wav                                ← generic block-end cue

The composite key `{trainingId}-{modeId}` matches what useSessionOrchestrator
passes to enqueueStepStart(), avoiding collisions when the same stepId appears
in multiple modes with different voice intros.

Usage (Kokoro model + voices must be available locally):
    python nuxt/scripts/generate_step_voices.py [--force]

    --force   Re-generate even if the WAV file already exists.

Run from the repo root or from the nuxt/ folder.
Keep PHRASES in sync with voiceIntro fields in trainingOverlayCatalog.ts.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# ─── Resolve paths ────────────────────────────────────────────────────────────
THIS = Path(__file__).resolve()
NUXT_ROOT = THIS.parent.parent
SCRIPTS_DIR = THIS.parent
OUTPUT_DIR = NUXT_ROOT / "public" / "voice" / "qualifying"

sys.path.insert(0, str(SCRIPTS_DIR))
from kokoro_tts_server import KokoroRuntime  # noqa: E402

VOICES = ["if_sara", "im_nicola"]
SPEED = 1.15

# ─── Phrases ─────────────────────────────────────────────────────────────────
# Format: (training_id, mode_id, step_id, voice_intro_text)
# Use training_id="" and mode_id="" for training-agnostic phrases (stepEnd).
#
# KEEP IN SYNC WITH trainingOverlayCatalog.ts voiceIntro fields.
PHRASES: list[tuple[str, str, str, str]] = [

    # ── Generic ───────────────────────────────────────────────────────────────
    ("", "", "stepEnd", "blocco terminato. avanza quando sei pronto"),

    # ── tracktitan_input · short30 ────────────────────────────────────────────
    ("tracktitan_input", "short30", "initial-run",
     "run. guida normale. crea dati puliti per il confronto tracktitan."),
    ("tracktitan_input", "short30", "tracktitan-review",
     "review. apri tracktitan. scegli un segmento solo."),
    ("tracktitan_input", "short30", "segment-focus-run",
     "run focus. pensa solo al segmento scelto. freno e gas come il coach."),
    ("tracktitan_input", "short30", "final-review",
     "recap. decidi se ripetere o passare al prossimo segmento."),

    # ── tracktitan_input · full60 ─────────────────────────────────────────────
    ("tracktitan_input", "full60", "initial-run",
     "run. guida normale. crea dati puliti per il confronto tracktitan."),
    ("tracktitan_input", "full60", "review-1",
     "review. apri tracktitan. scegli un segmento solo."),
    ("tracktitan_input", "full60", "focus-run-1",
     "run focus. pensa solo al segmento scelto. freno e gas come il coach."),
    ("tracktitan_input", "full60", "review-2",
     "review. apri tracktitan. scegli un segmento solo."),
    ("tracktitan_input", "full60", "focus-run-2",
     "run focus. pensa solo al segmento scelto. freno e gas come il coach."),
    ("tracktitan_input", "full60", "review-3",
     "review. apri tracktitan. scegli un segmento solo."),
    ("tracktitan_input", "full60", "final-focus-run",
     "run focus. pensa solo al segmento scelto. freno e gas come il coach."),
    ("tracktitan_input", "full60", "final-recap",
     "recap. decidi se ripetere o passare al prossimo segmento."),

    # ── clean_laps · short30 ──────────────────────────────────────────────────
    ("clean_laps", "short30", "warmup",
     "warm-up. stabilizza gomme, riferimenti e ritmo."),
    ("clean_laps", "short30", "clean-work",
     "blocco giri validi. spingi con margine. chiudi giri puliti."),
    ("clean_laps", "short30", "recap",
     "recap. segna invalidi, difficolta e cose buone."),

    # ── clean_laps · full60 ───────────────────────────────────────────────────
    ("clean_laps", "full60", "warmup",
     "warm-up. stabilizza gomme, riferimenti e ritmo."),
    ("clean_laps", "full60", "clean-work-1",
     "primo blocco validi. spingi con margine. proteggi i giri validi."),
    ("clean_laps", "full60", "review",
     "review breve. guarda gli invalidi. scegli un solo punto da correggere."),
    ("clean_laps", "full60", "clean-work-2",
     "secondo blocco. correggi quel punto. non alzare il rischio."),
    ("clean_laps", "full60", "recap",
     "recap. segna lavoro fatto e prossima priorita."),

    # ── qualifying · short30 ──────────────────────────────────────────────────
    ("qualifying", "short30", "warmup",
     "warm-up. scalda e prepara i riferimenti."),
    ("qualifying", "short30", "qualy-1",
     "qualifica uno. push lap validi. pochi tentativi, giro forte."),
    ("qualifying", "short30", "pause",
     "pausa. reset rapido. scegli una correzione sola."),
    ("qualifying", "short30", "qualy-2",
     "qualifica due. porta a casa un giro valido."),
    ("qualifying", "short30", "recap",
     "recap. segna best valido e punto perso."),

    # ── qualifying · full60 ───────────────────────────────────────────────────
    ("qualifying", "full60", "warmup",
     "warm-up. scalda e fissa i riferimenti."),
    ("qualifying", "full60", "pause-1",
     "pausa. reset. scegli una priorita tecnica."),
    ("qualifying", "full60", "qualy-1",
     "qualifica uno. push lap validi. primo riferimento."),
    ("qualifying", "full60", "pause-2",
     "pausa. scegli una correzione."),
    ("qualifying", "full60", "qualy-2",
     "qualifica due. spingi sul giro utile. tienilo valido."),
    ("qualifying", "full60", "pause-3",
     "pausa. resta sul punto piu costoso."),
    ("qualifying", "full60", "qualy-3",
     "qualifica tre. giro forte valido, niente miracoli."),
    ("qualifying", "full60", "pause-4",
     "pausa. ultimo reset. obiettivo semplice."),
    ("qualifying", "full60", "qualy-4",
     "qualifica quattro. esegui. porta a casa il giro."),
    ("qualifying", "full60", "recap",
     "recap. segna best valido e run migliore."),

    # ── consistency · short30 ─────────────────────────────────────────────────
    ("consistency", "short30", "warmup",
     "warm-up. trova passo e riferimenti ripetibili."),
    ("consistency", "short30", "stint",
     "stint costante. passo gara. niente best lap."),
    ("consistency", "short30", "recap",
     "recap. segna media, calo e punto debole."),

    # ── consistency · full60 ──────────────────────────────────────────────────
    ("consistency", "full60", "warmup",
     "warm-up. prepara passo, fuel e riferimenti."),
    ("consistency", "full60", "stint-1",
     "stint uno. passo gara. stesso margine ogni giro."),
    ("consistency", "full60", "review",
     "review. controlla media, calo e invalidi."),
    ("consistency", "full60", "stint-2",
     "stint due. ripeti il passo con una correzione."),
    ("consistency", "full60", "recap",
     "recap. segna stabilita e punto fragile."),

    # ── race_real · short30 ───────────────────────────────────────────────────
    ("race_real", "short30", "race-30",
     "gara vera. traffico, linee sporche, pressione. vai."),

    # ── race_real · full60 ────────────────────────────────────────────────────
    ("race_real", "full60", "race-60",
     "gara lunga. gruppo o lfm con gestione. concentrati."),
]


def wav_filename(training_id: str, mode_id: str, step_id: str, voice: str) -> str:
    """Return the output filename for a given phrase + voice combination."""
    if step_id == "stepEnd":
        return f"stepEnd-{voice}.wav"
    return f"step-{training_id}-{mode_id}-{step_id}-{voice}.wav"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate step voice WAV files via Kokoro TTS."
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-generate WAV files even if they already exist."
    )
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    runtime = KokoroRuntime()

    total = len(PHRASES) * len(VOICES)
    generated = skipped = errors = 0

    print(f"Generating step voice WAVs → {OUTPUT_DIR}")
    print(f"Voices : {', '.join(VOICES)}")
    print(f"Speed  : {SPEED}")
    print(f"Total  : {total} files\n")

    for training_id, mode_id, step_id, text in PHRASES:
        for voice in VOICES:
            filename = wav_filename(training_id, mode_id, step_id, voice)
            out_path = OUTPUT_DIR / filename

            if out_path.exists() and not args.force:
                print(f"  [SKIP] {filename}")
                skipped += 1
                continue

            try:
                wav_bytes = runtime.synthesize(text, voice, SPEED)
                out_path.write_bytes(wav_bytes)
                label = f"{training_id}/{mode_id}/{step_id}" if training_id else step_id
                print(f"  [OK]   {filename}")
                print(f"         [{label}] '{text[:68]}'")
                generated += 1
            except Exception as exc:
                print(f"  [ERR]  {filename}: {exc}", file=sys.stderr)
                errors += 1

    print(f"\n{'─' * 64}")
    print(f"Generated : {generated}")
    print(f"Skipped   : {skipped}  (use --force to regenerate)")
    print(f"Errors    : {errors}")
    print(f"Output    : {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
