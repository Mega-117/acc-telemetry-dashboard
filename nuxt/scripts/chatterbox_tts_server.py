from __future__ import annotations

import argparse
import json
import os
import tempfile
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VOICE_DIR = Path(
    os.environ.get("ACC_CHATTERBOX_VOICES_DIR", ROOT.parent / "training_data" / "chatterbox_voices")
).resolve()
TEMP_DIR = Path(os.environ.get("ACC_CHATTERBOX_TEMP_DIR", ROOT / ".codex-tmp" / "chatterbox")).resolve()
DEFAULT_VOICE_ID = "__default__"
MAX_TEXT_LENGTH = 600
DEFAULT_EXAGGERATION = 0.5
DEFAULT_CFG_WEIGHT = 0.5

READINESS_LOCK = threading.Lock()
GENERATION_LOCK = threading.Lock()
READINESS = {
    "state": "warming",
    "message": "Caricamento Chatterbox Multilingual V3 in corso.",
    "error": "",
    "startedAt": time.time(),
    "readyAt": None,
}


def configure_runtime_dirs() -> None:
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("TMP", str(TEMP_DIR))
    os.environ.setdefault("TEMP", str(TEMP_DIR))
    tempfile.tempdir = str(TEMP_DIR)


def voice_label(filename: str) -> str:
    words = [word for word in Path(filename).stem.replace("-", "_").split("_") if word]
    return " ".join(word[:1].upper() + word[1:] for word in words) or Path(filename).stem


def list_voices() -> list[dict[str, str]]:
    voices = [{"id": DEFAULT_VOICE_ID, "name": "Predefinita Chatterbox", "kind": "default"}]
    for path in sorted(VOICE_DIR.glob("*.wav"), key=lambda item: item.name.casefold()):
        if path.is_file():
            voices.append({"id": path.name, "name": voice_label(path.name), "kind": "sample"})
    return voices


def resolve_voice_prompt(voice_id: str) -> Path | None:
    if voice_id == DEFAULT_VOICE_ID:
        return None
    if Path(voice_id).name != voice_id or not voice_id.lower().endswith(".wav"):
        raise ValueError("Voce non valida")
    prompt = VOICE_DIR / voice_id
    if not prompt.is_file():
        raise FileNotFoundError(f"Campione vocale non trovato: {voice_id}")
    return prompt


def prosody_value(body: dict, key: str, default: float) -> float:
    try:
        value = float(body.get(key, default))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Parametro di tonalità non valido: {key}") from exc
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"Parametro di tonalità fuori range: {key}")
    return value


def set_readiness(state: str, message: str, error: str = "") -> None:
    with READINESS_LOCK:
        READINESS["state"] = state
        READINESS["message"] = message
        READINESS["error"] = error
        if state == "ready":
            READINESS["readyAt"] = time.time()


def readiness_payload() -> dict:
    with READINESS_LOCK:
        payload = dict(READINESS)
    payload["elapsedSeconds"] = round(time.time() - float(payload["startedAt"]), 1)
    return payload


class ChatterboxRuntime:
    def __init__(self) -> None:
        self.model = None
        self.torchaudio = None
        self.device = ""

    def load(self) -> None:
        if self.model is not None:
            return
        import torch
        import torchaudio
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        requested = os.environ.get("ACC_CHATTERBOX_DEVICE", "auto").strip().lower()
        self.device = "cuda" if requested == "auto" and torch.cuda.is_available() else requested
        if self.device == "auto":
            self.device = "cpu"
        self.torchaudio = torchaudio
        self.model = ChatterboxMultilingualTTS.from_pretrained(device=self.device, t3_model="v3")

    def synthesize(self, text: str, voice_id: str, exaggeration: float, cfg_weight: float) -> bytes:
        self.load()
        prompt = resolve_voice_prompt(voice_id)
        kwargs = {
            "language_id": "it",
            "exaggeration": exaggeration,
            "cfg_weight": cfg_weight,
        }
        if prompt is not None:
            kwargs["audio_prompt_path"] = str(prompt)
        with GENERATION_LOCK:
            wav = self.model.generate(text, **kwargs)
            with tempfile.NamedTemporaryFile(suffix=".wav", dir=TEMP_DIR, delete=False) as handle:
                output_path = Path(handle.name)
            try:
                self.torchaudio.save(str(output_path), wav, self.model.sr)
                return output_path.read_bytes()
            finally:
                output_path.unlink(missing_ok=True)


RUNTIME = ChatterboxRuntime()


def warmup_runtime() -> None:
    try:
        RUNTIME.load()
    except Exception as exc:
        traceback.print_exc()
        set_readiness("error", "Avvio Chatterbox fallito.", str(exc))
        return
    set_readiness("ready", f"Chatterbox Multilingual V3 pronto su {RUNTIME.device}.")


class ChatterboxHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            self.write_json({"ok": True, "engine": "chatterbox", "readiness": readiness_payload()})
            return
        if self.path == "/ready":
            readiness = readiness_payload()
            state = readiness.get("state")
            status = 200 if state == "ready" else 500 if state == "error" else 503
            self.write_json({"ok": state == "ready", "engine": "chatterbox", "readiness": readiness}, status)
            return
        if self.path == "/voices":
            self.write_json({"engine": "chatterbox", "voices": list_voices()})
            return
        self.write_json({"error": "Not found"}, 404)

    def do_POST(self) -> None:
        if self.path != "/speak":
            self.write_json({"error": "Not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 16_384:
                self.write_json({"error": "Payload non valido"}, 400)
                return
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            text = str(body.get("text", "")).strip()
            voice = str(body.get("voice", DEFAULT_VOICE_ID)).strip()
            exaggeration = prosody_value(body, "exaggeration", DEFAULT_EXAGGERATION)
            cfg_weight = prosody_value(body, "cfgWeight", DEFAULT_CFG_WEIGHT)
            if not text:
                self.write_json({"error": "Testo mancante"}, 400)
                return
            if len(text) > MAX_TEXT_LENGTH:
                self.write_json({"error": f"Testo troppo lungo: massimo {MAX_TEXT_LENGTH} caratteri"}, 400)
                return
            wav = RUNTIME.synthesize(text, voice, exaggeration, cfg_weight)
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav)))
            self.end_headers()
            self.wfile.write(wav)
        except (FileNotFoundError, ValueError) as exc:
            self.write_json({"error": str(exc)}, 400)
        except Exception as exc:
            traceback.print_exc()
            self.write_json({"error": str(exc)}, 500)

    def write_json(self, payload: dict, status: int = 200) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    configure_runtime_dirs()
    parser = argparse.ArgumentParser(description="Chatterbox Multilingual V3 server for ACC Suite Voice Lab.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=5121, type=int)
    args = parser.parse_args()

    ThreadingHTTPServer.allow_reuse_address = False
    try:
        server = ThreadingHTTPServer((args.host, args.port), ChatterboxHandler)
    except OSError as exc:
        print(f"Chatterbox: porta {args.port} gia' in uso. Esco. [{exc}]")
        return
    print(f"Chatterbox server listening on http://{args.host}:{args.port}")
    print(f"Voice samples: {VOICE_DIR}")
    threading.Thread(target=warmup_runtime, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
