"""Offline RVC vocal conversion endpoints.

The UI records or uploads a source vocal, then this router runs the official
RVC inference implementation against a user-provided local .pth model. All
runtime files live below the configured Voicebox storage directory.
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..config import get_data_dir

router = APIRouter(prefix="/rvc", tags=["rvc"])


def _root() -> Path:
    root = get_data_dir() / "rvc"
    for name in ("inputs", "outputs", "models", "indices", "assets", "logs"):
        (root / name).mkdir(parents=True, exist_ok=True)
    return root


def _safe_child(base: Path, name: str) -> Path:
    candidate = (base / Path(name).name).resolve()
    if candidate.parent != base.resolve():
        raise HTTPException(status_code=400, detail="Invalid file name")
    return candidate


@router.get("/status")
async def status() -> dict:
    root = _root()
    hubert = root / "assets" / "hubert_base" / "config.json"
    rmvpe = root / "assets" / "rmvpe" / "rmvpe.pt"
    models = sorted(p.name for p in (root / "models").glob("*.pth"))
    indices = sorted(p.name for p in (root / "indices").glob("*.index"))
    return {
        "root": str(root),
        "models": models,
        "indices": indices,
        "hubert_ready": hubert.is_file(),
        "rmvpe_ready": rmvpe.is_file(),
        "ready": bool(models) and hubert.is_file() and rmvpe.is_file(),
    }


async def _save_upload(upload: UploadFile, destination: Path) -> None:
    with destination.open("wb") as output:
        while chunk := await upload.read(1024 * 1024):
            output.write(chunk)
    await upload.close()


def _convert(
    input_path: Path,
    output_path: Path,
    model_path: Path,
    index_path: Path | None,
    pitch: int,
    index_rate: float,
    protect: float,
    output_format: str,
) -> None:
    root = _root()
    project_root = Path(__file__).resolve().parents[1] / "rvc_engine"
    os.environ["RVC_PROJECT_ROOT"] = str(project_root)
    os.environ["RVC_HUBERT_PATH"] = str(root / "assets" / "hubert_base")
    os.environ["weight_root"] = str(root / "models")
    os.environ["outside_index_root"] = str(root / "indices")
    os.environ["index_root"] = str(root / "logs")
    os.environ["rmvpe_root"] = str(root / "assets" / "rmvpe")
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from infer.cli import main as rvc_main

    args = [
        "--model", str(model_path),
        "--input", str(input_path),
        "--output", str(output_path),
        "--pitch", str(pitch),
        "--f0-method", "rmvpe",
        "--index-rate", str(index_rate),
        "--protect", str(protect),
        "--format", output_format,
        "--overwrite",
    ]
    if index_path:
        args.extend(["--index", str(index_path)])
    code = rvc_main(args)
    if code != 0 or not output_path.is_file():
        raise RuntimeError("RVC conversion failed; check that the model and base assets are installed")


@router.post("/convert")
async def convert(
    source: UploadFile = File(...),
    model: str = Form(...),
    index: str = Form(""),
    pitch: int = Form(0),
    index_rate: float = Form(0.75),
    protect: float = Form(0.33),
    output_format: str = Form("wav"),
):
    if output_format not in {"wav", "mp3", "flac", "m4a"}:
        raise HTTPException(status_code=400, detail="Output must be WAV, MP3, FLAC, or M4A")
    if not 0 <= index_rate <= 1 or not 0 <= protect <= 0.5:
        raise HTTPException(status_code=400, detail="Invalid RVC control value")
    root = _root()
    suffix = Path(source.filename or "source.wav").suffix.lower()
    if suffix not in {".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aac", ".wma", ".webm"}:
        raise HTTPException(status_code=400, detail="Upload a WAV, MP3, FLAC, M4A, OGG, AAC, or WMA file")
    model_path = _safe_child(root / "models", model)
    if not model_path.is_file() or model_path.suffix.lower() != ".pth":
        raise HTTPException(status_code=404, detail="RVC model not found in the E-drive RVC models folder")
    index_path = None
    if index:
        index_path = _safe_child(root / "indices", index)
        if not index_path.is_file() or index_path.suffix.lower() != ".index":
            raise HTTPException(status_code=404, detail="RVC index not found in the E-drive RVC indices folder")
    job_id = uuid.uuid4().hex
    input_path = root / "inputs" / f"{job_id}{suffix}"
    output_path = root / "outputs" / f"{job_id}.{output_format}"
    await _save_upload(source, input_path)
    try:
        await asyncio.to_thread(_convert, input_path, output_path, model_path, index_path, pitch, index_rate, protect, output_format)
    except Exception as exc:
        input_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    input_path.unlink(missing_ok=True)
    media = {"wav": "audio/wav", "mp3": "audio/mpeg", "flac": "audio/flac", "m4a": "audio/mp4"}[output_format]
    return FileResponse(output_path, media_type=media, filename=f"voicebox-rvc-{job_id}.{output_format}")
