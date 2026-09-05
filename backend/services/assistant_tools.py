"""Explicit, permission-scoped tools available to Assistant Mode."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..database import AssistantMemory, AssistantSettings, VoiceProfile


class AssistantToolError(ValueError):
    pass


def list_voices(db: Session) -> list[dict]:
    return [
        {"id": p.id, "name": p.name, "language": p.language, "voice_type": p.voice_type}
        for p in db.query(VoiceProfile).order_by(VoiceProfile.name.asc()).all()
    ]


def select_voice(db: Session, settings: AssistantSettings, profile_name: str) -> VoiceProfile:
    profile = next(
        (p for p in db.query(VoiceProfile).all() if p.name.lower() == profile_name.strip().lower()),
        None,
    )
    if profile is None:
        raise AssistantToolError(f"No existing Voicebox voice named {profile_name.strip()}.")
    settings.voice_profile_id = profile.id
    db.commit()
    return profile


def store_memory(db: Session, content: str, category: str | None = None) -> AssistantMemory:
    memory = AssistantMemory(
        content=content.strip(),
        category=category,
        source="explicit-user-request",
        approved=True,
        enabled=True,
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


def delete_memory(db: Session, memory_id: str) -> bool:
    memory = db.query(AssistantMemory).filter_by(id=memory_id).first()
    if memory is None:
        return False
    db.delete(memory)
    db.commit()
    return True
