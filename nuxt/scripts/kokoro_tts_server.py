from __future__ import annotations

import argparse
import io
import json
import os
import tempfile
import traceback
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = ROOT.parent
VOICE_DIR = ROOT / "node_modules" / "kokoro-js" / "voices"
LOCAL_MODEL_DIR = WORKSPACE_ROOT / "vendor" / "kokoro" / "Kokoro-82M"
DEFAULT_REPO_ID = "hexgrad/Kokoro-82M"
SAMPLE_RATE = 24_000

LANGUAGE_BY_PREFIX = {
    "a": ("en-US", "American English"),
    "b": ("en-GB", "British English"),
    "e": ("es-ES", "Spanish"),
    "f": ("fr-FR", "French"),
    "h": ("hi-IN", "Hindi"),
    "i": ("it-IT", "Italian"),
    "j": ("ja-JP", "Japanese"),
    "p": ("pt-BR", "Portuguese"),
    "z": ("zh-CN", "Mandarin Chinese"),
}

VOICE_LABELS = {
    "af_heart": "Heart",
    "af_alloy": "Alloy",
    "af_aoede": "Aoede",
    "af_bella": "Bella",
    "af_jessica": "Jessica",
    "af_kore": "Kore",
    "af_nicole": "Nicole",
    "af_nova": "Nova",
    "af_river": "River",
    "af_sarah": "Sarah",
    "af_sky": "Sky",
    "am_adam": "Adam",
    "am_echo": "Echo",
    "am_eric": "Eric",
    "am_fenrir": "Fenrir",
    "am_liam": "Liam",
    "am_michael": "Michael",
    "am_onyx": "Onyx",
    "am_puck": "Puck",
    "am_santa": "Santa",
    "bf_alice": "Alice",
    "bf_emma": "Emma",
    "bf_isabella": "Isabella",
    "bf_lily": "Lily",
    "bm_daniel": "Daniel",
    "bm_fable": "Fable",
    "bm_george": "George",
    "bm_lewis": "Lewis",
    "ef_dora": "Dora",
    "em_alex": "Alex",
    "em_santa": "Santa",
    "ff_siwis": "Siwis",
    "hf_alpha": "Alpha",
    "hf_beta": "Beta",
    "hm_omega": "Omega",
    "hm_psi": "Psi",
    "if_sara": "Sara",
    "im_nicola": "Nicola",
    "jf_alpha": "Alpha",
    "jf_gongitsune": "Gongitsune",
    "jf_nezumi": "Nezumi",
    "jf_tebukuro": "Tebukuro",
    "jm_kumo": "Kumo",
    "pf_dora": "Dora",
    "pm_alex": "Alex",
    "pm_santa": "Santa",
    "zf_xiaobei": "Xiaobei",
    "zf_xiaoni": "Xiaoni",
    "zf_xiaoxiao": "Xiaoxiao",
    "zf_xiaoyi": "Xiaoyi",
    "zm_yunjian": "Yunjian",
    "zm_yunxi": "Yunxi",
    "zm_yunxia": "Yunxia",
    "zm_yunyang": "Yunyang",
}


def configure_temp_dir() -> None:
    temp_dir = WORKSPACE_ROOT / ".codex-tmp"
    temp_dir.mkdir(exist_ok=True)
    os.environ.setdefault("TMP", str(temp_dir))
    os.environ.setdefault("TEMP", str(temp_dir))
    tempfile.tempdir = str(temp_dir)


def find_cached_model_dir() -> Path | None:
    if (LOCAL_MODEL_DIR / "config.json").exists() and (LOCAL_MODEL_DIR / "kokoro-v1_0.pth").exists():
        return LOCAL_MODEL_DIR

    cache_root = Path.home() / ".cache" / "huggingface" / "hub" / "models--hexgrad--Kokoro-82M" / "snapshots"
    if not cache_root.exists():
        return None

    for candidate in sorted(cache_root.iterdir(), reverse=True):
        if (candidate / "config.json").exists() and (candidate / "kokoro-v1_0.pth").exists():
            return candidate
    return None


class KokoroRuntime:
    def __init__(self) -> None:
        self.model = None
        self.pipelines = {}
        self.torch = None
        self.np = None
        self.KModel = None
        self.KPipeline = None

    def ensure_imports(self) -> None:
        if self.torch is not None:
            return

        import numpy as np
        import torch
        from kokoro import KModel, KPipeline

        self.np = np
        self.torch = torch
        self.KModel = KModel
        self.KPipeline = KPipeline

    def make_pipeline_class(self):
        self.ensure_imports()
        runtime = self

        class LocalVoicePipeline(runtime.KPipeline):
            def load_single_voice(self, voice: str):
                if voice in self.voices:
                    return self.voices[voice]

                voice_path = VOICE_DIR / f"{voice}.bin"
                if not voice_path.exists():
                    raise FileNotFoundError(f"Voice file not found: {voice_path}")

                values = runtime.np.fromfile(voice_path, dtype=runtime.np.float32)
                if values.size != 510 * 256:
                    raise ValueError(f"Unexpected voice pack shape for {voice}: {values.size}")

                pack = runtime.torch.from_numpy(values.reshape(510, 1, 256))
                self.voices[voice] = pack
                return pack

        return LocalVoicePipeline

    def get_model(self):
        if self.model is not None:
            return self.model

        self.ensure_imports()
        model_dir = find_cached_model_dir()
        if model_dir is None:
            raise RuntimeError(
                "Kokoro model not found locally. Put config.json and kokoro-v1_0.pth in "
                f"{LOCAL_MODEL_DIR} or warm the Hugging Face cache once."
            )

        self.model = self.KModel(
            repo_id=DEFAULT_REPO_ID,
            config=str(model_dir / "config.json"),
            model=str(model_dir / "kokoro-v1_0.pth"),
        ).to("cpu").eval()
        return self.model

    def get_pipeline(self, lang_code: str):
        if lang_code not in self.pipelines:
            pipeline_class = self.make_pipeline_class()
            self.pipelines[lang_code] = pipeline_class(
                lang_code=lang_code,
                repo_id=DEFAULT_REPO_ID,
                model=self.get_model(),
                device="cpu",
            )
        return self.pipelines[lang_code]

    def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        lang_code = voice[0].lower()
        pipeline = self.get_pipeline(lang_code)
        chunks = []

        with self.torch.inference_mode():
            for result in pipeline(text, voice=voice, speed=speed):
                if result.output is not None:
                    chunks.append(result.output.audio.detach().cpu().numpy())

        if not chunks:
            raise RuntimeError("Kokoro did not return audio.")

        audio = self.np.concatenate(chunks).astype(self.np.float32)
        return to_wav(audio)


def to_wav(audio) -> bytes:
    import numpy as np

    pcm = np.clip(audio, -1.0, 1.0)
    pcm = (pcm * 32767).astype(np.int16)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())
    return buffer.getvalue()


def list_voices() -> list[dict[str, str]]:
    voices = []
    for path in sorted(VOICE_DIR.glob("*.bin")):
        voice_id = path.stem
        lang, language_name = LANGUAGE_BY_PREFIX.get(voice_id[0], ("unknown", "Unknown"))
        gender = "Female" if len(voice_id) > 1 and voice_id[1] == "f" else "Male"
        label = VOICE_LABELS.get(voice_id, voice_id)
        voices.append({
            "id": voice_id,
            "name": f"Kokoro {label}",
            "engine": "Kokoro TTS",
            "lang": lang,
            "language": lang,
            "gender": gender,
            "quality": "neural offline",
            "description": f"{language_name}, {gender.lower()}, voice pack locale",
        })
    return voices


RUNTIME = KokoroRuntime()


class KokoroHandler(BaseHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/health":
                self.write_json({"ok": True, "engine": "kokoro"})
            elif parsed.path == "/voices":
                self.write_json({"engine": "kokoro", "voices": list_voices()})
            elif parsed.path == "/speak":
                self.handle_speak(parsed.query)
            else:
                self.write_json({"error": "Not found"}, status=404)
        except Exception as exc:
            traceback.print_exc()
            self.write_json({"error": str(exc)}, status=500)

    def handle_speak(self, query: str) -> None:
        params = parse_qs(query)
        text = params.get("text", [""])[0].strip()
        voice = params.get("voice", ["if_sara"])[0].strip()
        speed = float(params.get("speed", ["1.0"])[0])

        if not text:
            self.write_json({"error": "Missing text"}, status=400)
            return
        if not (VOICE_DIR / f"{voice}.bin").exists():
            self.write_json({"error": f"Unknown voice: {voice}"}, status=404)
            return
        if speed < 0.5 or speed > 2:
            self.write_json({"error": "Speed must be between 0.5 and 2"}, status=400)
            return

        wav_bytes = RUNTIME.synthesize(text[:600], voice, speed)
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav_bytes)))
        self.end_headers()
        self.wfile.write(wav_bytes)

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
    configure_temp_dir()
    parser = argparse.ArgumentParser(description="Local Kokoro TTS server for the Nuxt voice lab.")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", default=5111, type=int)
    args = parser.parse_args()

    if not VOICE_DIR.exists():
        raise RuntimeError(f"Kokoro voice directory not found: {VOICE_DIR}")

    server = ThreadingHTTPServer((args.host, args.port), KokoroHandler)
    print(f"Kokoro TTS server listening on http://{args.host}:{args.port}")
    print(f"Voices: {len(list_voices())}")
    server.serve_forever()


if __name__ == "__main__":
    main()
