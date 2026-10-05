"""Local Jamaican Patwah learning and translation helpers.

The starter entries are intentionally short, contextual phrases rather than a
claim to represent every Jamaican speaker or regional usage. Meanings were
cross-checked against educational references including JamaicanPatwah.com and
Sandals' Jamaican phrase guide; the app presents them as learning aids and
encourages context-aware use.
"""

from __future__ import annotations

import re
from typing import Optional

from .llm import get_llm_model


PATWA_ENTRIES: tuple[dict[str, str], ...] = (
    {"patwah": "Wah gwaan?", "english": "What's up? / How are you?", "category": "greetings", "note": "A casual greeting; meaning depends on context and tone."},
    {"patwah": "Weh yuh ah seh?", "english": "How are you doing? / What's going on?", "category": "greetings", "note": "A casual conversation opener."},
    {"patwah": "Mawnin.", "english": "Good morning.", "category": "greetings", "note": "A common morning greeting."},
    {"patwah": "Mi deh yah, tank yuh.", "english": "I'm doing well, thank you.", "category": "greetings", "note": "A response to a greeting."},
    {"patwah": "Mi irie.", "english": "I'm okay / I'm doing well.", "category": "greetings", "note": "Irie can express being well or okay."},
    {"patwah": "Weh yuh deh pon?", "english": "What are you up to?", "category": "conversation", "note": "Usually used with friends or acquaintances."},
    {"patwah": "Mi soon come.", "english": "I'll be there soon / I'll be right back.", "category": "conversation", "note": "The timing is context-dependent; it does not always mean immediately."},
    {"patwah": "Likkle more.", "english": "See you later / Goodbye.", "category": "farewells", "note": "A casual farewell."},
    {"patwah": "Inna di morrows.", "english": "See you tomorrow.", "category": "farewells", "note": "A farewell specifically referring to tomorrow."},
    {"patwah": "Bless up.", "english": "Have a good day / Take care.", "category": "farewells", "note": "Can be used as a greeting or farewell."},
    {"patwah": "One love.", "english": "Peace, unity, and goodwill.", "category": "respect", "note": "A greeting or farewell associated with unity and respect."},
    {"patwah": "Nuff respect.", "english": "Thank you / Much respect.", "category": "respect", "note": "Expresses gratitude or appreciation."},
    {"patwah": "Yuh dun know.", "english": "You already know / You understand.", "category": "conversation", "note": "Often signals agreement or shared understanding."},
    {"patwah": "Zeen.", "english": "Got it / Okay / Understood.", "category": "conversation", "note": "A short acknowledgement."},
    {"patwah": "Ya mon.", "english": "Yes, man / No problem / Okay.", "category": "conversation", "note": "A relaxed affirmative expression."},
    {"patwah": "Small up yuhself.", "english": "Make room.", "category": "conversation", "note": "Context and tone matter; it can sound direct."},
    {"patwah": "Bredda.", "english": "Brother / Close male friend.", "category": "people", "note": "A casual, affectionate form of address."},
    {"patwah": "Nuh.", "english": "No / Not.", "category": "basics", "note": "A common negation marker."},
    {"patwah": "Mi.", "english": "I / me.", "category": "basics", "note": "Pronoun meaning depends on sentence position."},
    {"patwah": "Fi mi.", "english": "My / for me.", "category": "basics", "note": "Possession or purpose is understood from context."},
    {"patwah": "Bun bad mind.", "english": "Reject bad intentions / jealousy.", "category": "respect", "note": "An expression against ill will."},
    {"patwah": "Mash up.", "english": "Broken / destroyed / in disarray.", "category": "descriptions", "note": "Can be used as a verb or description."},
    {"patwah": "Dead wid laugh.", "english": "Dying with laughter.", "category": "expressions", "note": "An expressive phrase about laughing very hard."},
    {"patwah": "How yuh duh?", "english": "How are you?", "category": "greetings", "note": "A casual question about someone's wellbeing."},
    {"patwah": "A weh yuh a seh?", "english": "What's happening? / What are you saying?", "category": "greetings", "note": "Can be a casual opener or request for clarification."},
)

_MARKERS = {
    "mi", "me", "yuh", "yu", "unu", "dem", "di", "deh", "pon", "inna",
    "gwaan", "weh", "ah", "fi", "nuh", "irie", "zeen", "bredda", "mon",
    "mash", "bun", "likkle", "mornin", "mawnin", "tank", "todeh",
}


def list_entries(category: Optional[str] = None) -> list[dict[str, str]]:
    if not category:
        return [dict(entry) for entry in PATWA_ENTRIES]
    return [dict(entry) for entry in PATWA_ENTRIES if entry["category"] == category]


def detect(text: str) -> tuple[bool, float, list[str]]:
    normalized = re.sub(r"[^a-z0-9' ]+", " ", text.lower())
    tokens = set(normalized.split())
    matched = sorted(tokens & _MARKERS)
    phrase_match = any(entry["patwah"].lower().rstrip("?.!") in normalized for entry in PATWA_ENTRIES)
    score = min(0.98, 0.25 + len(matched) * 0.12 + (0.35 if phrase_match else 0.0))
    return (phrase_match or len(matched) >= 2), round(score, 2), matched


def _fallback_translation(text: str, direction: str) -> tuple[str, Optional[dict[str, str]]]:
    normalized = re.sub(r"[^a-z0-9 ]+", "", text.lower()).strip()
    for entry in PATWA_ENTRIES:
        source = entry["patwah"] if direction == "patwah-to-english" else entry["english"]
        if re.sub(r"[^a-z0-9 ]+", "", source.lower()).strip() == normalized:
            return (entry["english"] if direction == "patwah-to-english" else entry["patwah"], entry)
    return (text, None)


async def translate(text: str, direction: str, model_size: Optional[str] = None) -> tuple[str, str, Optional[dict[str, str]]]:
    clean = text.strip()
    fallback, matched = _fallback_translation(clean, direction)
    target = "Standard English" if direction == "patwah-to-english" else "Jamaican Patwah"
    source = "Jamaican Patwah" if direction == "patwah-to-english" else "Standard English"
    prompt = (
        f"Translate the following from {source} to {target}. Preserve the speaker's intent and tone. "
        "Do not invent context. Return only the translation, with no quotation marks or explanation.\n\n"
        f"Text: {clean}\nTranslation:"
    )
    system = (
        "You are a careful Jamaican Patwah learning assistant. Jamaican Patwah is a living language "
        "with regional and contextual variation. Prefer natural, respectful wording over literal word "
        "substitution. If a phrase is ambiguous, give the most likely translation and keep it concise."
    )
    try:
        backend = get_llm_model()
        translated = (await backend.generate(
            prompt=prompt,
            system=system,
            max_tokens=256,
            temperature=0.2,
            model_size=model_size or "1.7B",
        )).strip()
        if translated:
            return translated, "local-llm", matched
    except Exception:
        pass
    return fallback, "phrase-library", matched
