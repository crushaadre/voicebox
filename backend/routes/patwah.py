"""Jamaican Patwah learning and translation endpoints."""

from fastapi import APIRouter

from .. import models
from ..services import patwah

router = APIRouter()


@router.get("/patwah/library")
def get_patwah_library(category: str | None = None):
    return {"entries": patwah.list_entries(category), "categories": sorted({entry["category"] for entry in patwah.PATWA_ENTRIES})}


@router.post("/patwah/detect", response_model=models.PatwahDetectResponse)
def detect_patwah(request: models.PatwahDetectRequest):
    is_patwah, confidence, markers = patwah.detect(request.text)
    return models.PatwahDetectResponse(
        is_patwah=is_patwah,
        confidence=confidence,
        matched_markers=markers,
    )


@router.post("/patwah/translate", response_model=models.PatwahTranslateResponse)
async def translate_patwah(request: models.PatwahTranslateRequest):
    translation, provider, matched_entry = await patwah.translate(
        request.text, request.direction, request.model_size
    )
    return models.PatwahTranslateResponse(
        source_text=request.text,
        translation=translation,
        direction=request.direction,
        provider=provider,
        matched_entry=matched_entry,
    )
