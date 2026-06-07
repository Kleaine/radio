from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


ROOT_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT_DIR / "configs" / "voices.json"
OUTPUT_DIR = ROOT_DIR / "outputs"

GPT_SOVITS_API = os.getenv("GPT_SOVITS_API", "http://127.0.0.1:9880")

app = FastAPI(title="Local TTS Service", version="0.1.0")


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    voice: str = Field(..., examples=["gentle_female", "lively_female", "announcer_male"])
    text_lang: str | None = Field(default=None, examples=["zh", "en"])


def infer_text_lang(text: str) -> str:
    return "zh" if any("\u4e00" <= char <= "\u9fff" for char in text) else "en"


def load_voices() -> dict[str, dict[str, Any]]:
    if not CONFIG_PATH.exists():
        raise HTTPException(status_code=500, detail=f"Voice config missing: {CONFIG_PATH}")
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return {item["id"]: item for item in data["voices"]}


def postprocess_audio(raw_path: Path, out_path: Path, voice: dict[str, Any]) -> None:
    effects = voice.get("postprocess", {})
    pitch_semitones = float(effects.get("pitch_semitones", 0))
    tempo = float(effects.get("tempo", 1.0))
    sample_rate = int(effects.get("sample_rate", 32000))

    if pitch_semitones == 0 and tempo == 1.0:
        raw_path.replace(out_path)
        return

    if shutil.which("ffmpeg") is None:
        raw_path.replace(out_path)
        return

    pitch_factor = 2 ** (pitch_semitones / 12)
    atempo = tempo / pitch_factor
    if not 0.5 <= atempo <= 2.0:
        raise HTTPException(status_code=500, detail=f"Invalid ffmpeg atempo value: {atempo:.3f}")

    audio_filter = f"asetrate={sample_rate * pitch_factor:.3f},aresample={sample_rate},atempo={atempo:.6f}"
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-i",
        str(raw_path),
        "-filter:a",
        audio_filter,
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Audio postprocess failed: {result.stderr}")
    raw_path.unlink(missing_ok=True)


@app.get("/health")
def health() -> dict[str, Any]:
    upstream_ok = False
    try:
        res = requests.get(f"{GPT_SOVITS_API}/control", params={"command": "ping"}, timeout=1)
        upstream_ok = res.status_code < 500
    except requests.RequestException:
        upstream_ok = False
    return {
        "status": "ok",
        "gpt_sovits_api": GPT_SOVITS_API,
        "gpt_sovits_reachable": upstream_ok,
    }


@app.get("/voices")
def voices() -> list[dict[str, Any]]:
    return list(load_voices().values())


@app.post("/synthesize")
def synthesize(req: SynthesizeRequest) -> FileResponse:
    voice_map = load_voices()
    voice = voice_map.get(req.voice)
    if voice is None:
        raise HTTPException(status_code=400, detail=f"Unknown voice: {req.voice}")

    ref_audio_path = ROOT_DIR / voice["ref_audio_path"]
    if not ref_audio_path.exists():
        raise HTTPException(
            status_code=422,
            detail=(
                f"Reference audio missing for {req.voice}: {ref_audio_path}. "
                "Put a clean 5-15s wav file at that path, then retry."
            ),
        )

    text = req.text.strip()
    text_lang = (req.text_lang or infer_text_lang(text)).lower()
    if text_lang not in {"zh", "en"}:
        raise HTTPException(status_code=400, detail=f"Unsupported text_lang: {text_lang}")

    payload = {
        "text": text,
        "text_lang": text_lang,
        "ref_audio_path": str(ref_audio_path),
        "prompt_text": voice["prompt_text"],
        "prompt_lang": voice.get("prompt_lang", "zh"),
        "text_split_method": "cut5",
        "batch_size": 1,
        "speed_factor": voice.get("speed_factor", 1.0),
        "media_type": "wav",
        "streaming_mode": False,
    }

    try:
        res = requests.post(f"{GPT_SOVITS_API}/tts", json=payload, timeout=180)
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=503,
            detail=f"GPT-SoVITS API is not reachable at {GPT_SOVITS_API}: {exc}",
        ) from exc

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=res.text)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{int(time.time())}_{req.voice}_{uuid.uuid4().hex[:8]}.wav"
    out_path = OUTPUT_DIR / filename
    raw_path = OUTPUT_DIR / f"{out_path.stem}_raw.wav"
    raw_path.write_bytes(res.content)
    postprocess_audio(raw_path, out_path, voice)
    return FileResponse(out_path, media_type="audio/wav", filename=filename)
