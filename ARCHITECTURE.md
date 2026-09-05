# Voicebox Assistant Architecture Audit

## Scope

This audit covers the edited `crushaadre/voicebox` fork at commit `0e47cbf`. The fork already contains the Windows E-drive storage correction and the RVC vocal-conversion section. The purpose of this document is to identify safe extension points for a local Jarvis-style assistant without replacing or breaking the existing Voicebox application.

## Existing system

Voicebox is a Tauri desktop application with a React/TypeScript frontend in `app/`, a FastAPI/Python backend in `backend/`, and a Rust/Tauri shell under `tauri/`. The frontend uses TanStack Router and a generated API client. The backend owns model loading, persistence, audio processing, HTTP routes, MCP exposure, and the packaged server process.

The main frontend route tree is in `app/src/router.tsx`. Existing top-level experiences include the main editor, stories, voices, captures, effects, models, settings, and the edited RVC screen at `/rvc`. Navigation is provided by `app/src/components/Sidebar.tsx`. A new Assistant Mode should therefore be added as a sibling route and sidebar entry rather than replacing the main editor or capture workflow.

The backend application is created in `backend/app.py`. It initializes the database, model/cache state, progress queue, hardware detection, and MCP lifespan. Domain routers are registered centrally in `backend/routes/__init__.py`. This is the clean integration point for new `/assistant/*` endpoints. Existing MCP functionality is mounted at `/mcp` and must remain intact.

## Storage contract

The edited fork centralizes data access through `backend/config.py`. The configured data root provides database, profiles, generations, captures, cache, and model directories. The packaged Windows application sets the root to `E:\Voicebox\sh.voicebox.app`; the backend route boundary and RVC adapter also use this configured root. Assistant conversations, memories, assistant audio, temporary files, and assistant-specific model metadata must use the same helper instead of introducing independent paths.

Recommended assistant subdirectories are:

| Purpose | Directory |
|---|---|
| Conversation and memory database records | Existing `voicebox.db` through the database layer |
| Assistant audio inputs and outputs | `E:\Voicebox\sh.voicebox.app\assistant\audio` |
| Assistant configuration exports | `E:\Voicebox\sh.voicebox.app\assistant\config` |
| Assistant model metadata or provider cache | `E:\Voicebox\sh.voicebox.app\assistant\models` or the existing model helper |
| RVC models | `E:\Voicebox\sh.voicebox.app\rvc\models` |
| RVC indexes | `E:\Voicebox\sh.voicebox.app\rvc\indices` |

The implementation should keep paths database-relative with the existing `to_storage_path` and `resolve_storage_path` conventions.

## Existing model abstractions

The backend already exposes protocol-style abstractions for TTS, STT, and LLM backends in `backend/backends/__init__.py`. The `LLMBackend` protocol provides asynchronous model loading, single-turn generation, model unloading, and loaded-state checks. Current local LLM configurations are Qwen3 variants (`0.6B`, `1.7B`, and `4B`) selected according to the platform backend. Existing STT configurations are Whisper variants, and TTS configurations include Qwen TTS, Qwen CustomVoice, LuxTTS, Chatterbox, TADA, and Kokoro.

The existing LLM interface is currently optimized for single-turn refinement or personality-related generation. It does not yet expose a first-class conversation object, structured message history, tool-call protocol, cancellation, or assistant session state. Assistant Mode should add a separate `AssistantProvider` adapter around the existing `LLMBackend`, preserving the current `generate(prompt, system, ...)` method for existing callers. The adapter can serialize bounded conversation history into the current local model prompt format first, while allowing a future backend to support native chat templates and structured tool calls.

## Existing speech pipeline

The backend already provides transcription routes and an STT backend protocol. Captures persist original audio and raw/refined transcripts in the `captures` table. This makes the existing capture/transcription functionality the preferred starting point for push-to-talk rather than introducing a second microphone or Whisper implementation.

TTS generation already accepts a selected `VoiceProfile`, engine, language, seed, instruction, and personality-related behavior. A selected assistant voice should reference an existing profile ID and call the existing generation service. Assistant responses should be stored as assistant-origin generations or in an assistant message table with a link to the resulting generation. No duplicate voice profiles should be created.

## Existing voice and personality system

The `profiles` table stores cloned, preset, and designed voice profiles. It includes `personality`, but that field currently describes speech/personality behavior associated with a profile and is not a complete assistant identity system. Assistant personality should be stored separately from the selected voice so that changing the voice does not change the assistant’s behavior. Voice selection should use explicit profile IDs and a controlled resolver, not unrestricted file or database manipulation by the LLM.

## Existing database

The database already contains profiles, profile samples, generations, stories, projects, generation versions, effects, audio channels, capture settings, generation settings, cloud settings, MCP bindings, and captures. There are no dedicated conversation, assistant-session, or long-term-memory tables in the audited schema. The assistant should add additive tables with explicit migrations or the project’s existing initialization/migration convention. Suggested tables are `assistant_sessions`, `assistant_messages`, `assistant_memories`, and `assistant_settings`.

Conversation messages should include role, content, timestamps, tool-call metadata, and optional links to source capture or generated audio. Memories should include content, user approval/source, enabled state, timestamps, and optional category. Sensitive information must not be silently persisted.

## Existing MCP capabilities

The MCP server already exposes explicit tools including `voicebox.speak`, `voicebox.transcribe`, `voicebox.list_captures`, and `voicebox.list_profiles`. This demonstrates a controlled tool pattern that the assistant can mirror internally. Core assistant tools should use direct internal services for reliability and latency, while preserving MCP for external agents. The assistant must not receive unrestricted shell execution, arbitrary file writes, or unrestricted database access.

Initial internal tools should be limited to listing profiles, selecting the assistant voice, speaking through an existing profile, storing/searching/deleting explicitly authorized memories, and optionally querying current conversation state. Destructive or external actions should require explicit user confirmation.

## Recommended assistant architecture

```text
Assistant Mode UI
        |
        v
Assistant API routes
        |
        v
Assistant service
  |       |        |        |
  LLM   Session   Memory   Tool manager
  |       |        |        |
  v       v        v        v
Qwen   SQLite   SQLite   Existing Voicebox services
                         |       |       |
                         STT     TTS/voices/RVC
```

The assistant service should own orchestration, context-window trimming, personality settings, memory policy, tool permission checks, and voice selection. Existing STT, TTS, profile, generation, capture, model, MCP, and RVC services should remain the implementation owners of their respective domains.

## First implementation slice

The lowest-risk first slice is text chat plus conversation persistence and selectable existing Voicebox voice output. It should add Assistant Mode, assistant settings, a session/message API, bounded local-LLM context, a voice selector using existing profiles, and a speak-response action using existing TTS. Push-to-talk can then connect the existing capture/transcription path to the chat endpoint. Opt-in long-term memory and controlled tools should follow after the core text and voice loop is verified.

## Risks and constraints

The local LLM models are resource-intensive and the application already loads TTS, STT, and LLM models with explicit unload paths. Assistant orchestration must avoid keeping unnecessary models resident simultaneously. The assistant should expose model/backend status and fall back gracefully when a selected model is unavailable. A stronger local model may be needed for dependable tool calling; the provider boundary should allow replacing Qwen3 without changing the assistant UI or voice system.

The current generated API client may require regeneration or compatible handwritten client methods when new routes are added. The Tauri packaged backend must include new Python modules and database initialization changes. All assistant and RVC runtime assets must remain under the E-drive storage root in Windows builds.

## Audit conclusion

The edited fork is suitable as the foundation. The cleanest path is additive: preserve the current Tauri/React/FastAPI architecture, reuse the existing local model abstractions and voice services, add an assistant service and additive database tables, expose narrowly scoped assistant routes, and add a sibling Assistant Mode UI. No rewrite of Voicebox or replacement of the existing RVC feature is required.
