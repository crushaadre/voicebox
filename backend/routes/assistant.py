"""Assistant Mode API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import mimetypes
from sqlalchemy.orm import Session

from .. import models
from ..database import AssistantMemory, AssistantMessage, AssistantSession, VoiceProfile, get_db
from ..services import assistant

router = APIRouter()


@router.get("/assistant/audio/{filename}")
def get_assistant_audio(filename: str):
    """Serve only generated assistant audio beneath the configured data root."""
    audio_dir = (assistant.config.get_data_dir() / "assistant" / "audio").resolve()
    candidate = (audio_dir / Path(filename).name).resolve()
    if candidate.parent != audio_dir or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Assistant audio not found")
    return FileResponse(candidate, media_type=mimetypes.guess_type(candidate.name)[0] or "audio/wav")


def _session_response(session: AssistantSession) -> models.AssistantSessionResponse:
    return models.AssistantSessionResponse.model_validate(session)


def _message_response(message: AssistantMessage) -> models.AssistantMessageResponse:
    return models.AssistantMessageResponse.model_validate(message)


@router.get("/assistant/settings", response_model=models.AssistantSettingsResponse)
def get_assistant_settings(db: Session = Depends(get_db)):
    return assistant.get_or_create_settings(db)


@router.put("/assistant/settings", response_model=models.AssistantSettingsResponse)
def update_assistant_settings(
    request: models.AssistantSettingsUpdate, db: Session = Depends(get_db)
):
    settings = assistant.get_or_create_settings(db)
    values = request.model_dump(exclude_unset=True)
    if "voice_profile_id" in values and values["voice_profile_id"]:
        profile = db.query(VoiceProfile).filter_by(id=values["voice_profile_id"]).first()
        if profile is None:
            raise HTTPException(status_code=404, detail="Voice profile not found")
    for key, value in values.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/assistant/voices")
def list_assistant_voices(db: Session = Depends(get_db)):
    profiles = db.query(VoiceProfile).order_by(VoiceProfile.name.asc()).all()
    return [
        {
            "id": profile.id,
            "name": profile.name,
            "language": profile.language,
            "voice_type": profile.voice_type,
            "default_engine": profile.default_engine,
        }
        for profile in profiles
    ]


@router.get("/assistant/sessions", response_model=list[models.AssistantSessionResponse])
def list_assistant_sessions(db: Session = Depends(get_db)):
    return db.query(AssistantSession).order_by(AssistantSession.updated_at.desc()).limit(100).all()


@router.post("/assistant/sessions", response_model=models.AssistantSessionResponse)
def create_assistant_session(
    request: models.AssistantSessionCreate, db: Session = Depends(get_db)
):
    return assistant.create_session(db, request.title)


@router.get(
    "/assistant/sessions/{session_id}/messages",
    response_model=list[models.AssistantMessageResponse],
)
def get_assistant_messages(session_id: str, db: Session = Depends(get_db)):
    try:
        assistant.get_session(db, session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return assistant.list_messages(db, session_id, limit=200)


@router.post(
    "/assistant/sessions/{session_id}/chat",
    response_model=models.AssistantChatResponse,
)
async def assistant_chat(
    session_id: str,
    request: models.AssistantChatRequest,
    db: Session = Depends(get_db),
):
    settings = assistant.get_or_create_settings(db)
    if not settings.enabled:
        raise HTTPException(status_code=409, detail="Assistant Mode is disabled")
    try:
        session, user_message, assistant_message, selected_model = await assistant.chat(
            db,
            session_id,
            request.message,
            request.model_size,
            request.remember,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Assistant generation failed") from exc

    audio_path = None
    if request.speak_response:
        try:
            audio_path = await assistant.speak_response(db, assistant_message.content, settings)
        except Exception:
            # Text chat remains usable when a TTS model or voice profile is unavailable.
            audio_path = None

    return models.AssistantChatResponse(
        session=_session_response(session),
        user_message=_message_response(user_message),
        assistant_message=_message_response(assistant_message),
        audio_path=audio_path,
        model_size=selected_model,
    )


@router.get("/assistant/memory", response_model=list[models.AssistantMemoryResponse])
def list_memories(
    query: str | None = None, limit: int = 20, db: Session = Depends(get_db)
):
    return assistant.search_memories(db, query, min(max(limit, 1), 100))


@router.post("/assistant/memory", response_model=models.AssistantMemoryResponse)
def create_memory(
    request: models.AssistantMemoryCreate, db: Session = Depends(get_db)
):
    return assistant.add_memory(db, request.content, request.category)


@router.delete("/assistant/memory/{memory_id}")
def delete_memory(memory_id: str, db: Session = Depends(get_db)):
    memory = db.query(AssistantMemory).filter_by(id=memory_id).first()
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    db.delete(memory)
    db.commit()
    return {"deleted": True, "id": memory_id}


@router.delete("/assistant/memory")
def clear_memories(db: Session = Depends(get_db)):
    count = db.query(AssistantMemory).delete()
    db.commit()
    return {"deleted": count}
