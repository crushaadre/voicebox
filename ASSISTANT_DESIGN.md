# Voicebox Assistant Mode Design

## Design objective

Assistant Mode will be an additive local assistant layer on top of the edited Voicebox fork. It will reuse the existing Qwen3 local LLM, Whisper STT, Voicebox TTS engines, voice profiles, capture system, database, MCP conventions, and E-drive storage root. Normal Voicebox operation remains available when Assistant Mode is not being used.

## Model strategy

The first implementation uses the existing Qwen3 local LLM backend through a new provider adapter. The provider supports the currently configured local model variants and does not introduce a cloud dependency. The adapter will expose a conversation-oriented interface even though the current backend primarily exposes single-turn generation. It will serialize bounded message history into the existing backend format and will preserve the existing model-loading and unloading lifecycle.

The assistant will not automatically download a large model. It will use an available model selected by existing Voicebox model-management mechanisms and will report a clear unavailable-model state. The provider boundary will permit a future chat-native local backend without changing the assistant service or UI.

## Conversation model

An assistant session is a persisted conversation. Each message has a role, content, timestamp, and optional metadata for source capture, generated audio, or tool execution. The service sends the system personality, a bounded recent-message window, and selected memory context to the local LLM. Older messages remain in SQLite but are summarized or omitted from the active prompt when the context budget requires it.

## Personality and voice

Assistant personality is stored independently from the selected Voicebox profile. The user can set an assistant name, system instructions, response style, verbosity, language, and humor/formality preferences. The selected voice is an existing profile ID. Voice changes modify TTS output only and do not mutate personality settings.

## Memory policy

Long-term memory is opt-in. The first implementation supports explicit commands or UI actions to store, search, delete, and clear memories. The assistant will not silently store sensitive content. Each stored memory records its source and approval state. Disabling memory prevents new writes while preserving existing records until the user deletes them.

## Tool policy

The initial tool manager exposes only explicit internal functions:

| Tool | Permission |
|---|---|
| List available Voicebox voices | Read-only |
| Select an existing assistant voice | User-scoped setting change |
| Speak text with the selected profile | Local audio-generation action |
| Store a memory | Requires explicit user request or UI confirmation |
| Search memories | Read-only over assistant memory |
| Delete a memory or clear memories | Requires explicit user confirmation |

There is no unrestricted shell execution, arbitrary file access, or direct database tool. External actions and destructive operations are out of scope for the first release.

## Voice conversation pipeline

The first backend API supports text chat. The existing capture/transcription path is then connected as an input adapter: microphone or imported audio becomes a capture, Whisper produces text, the assistant service processes the text, and existing Voicebox TTS generates the response using the selected profile. The response audio remains under the configured E-drive root.

## Resource management

The assistant service requests models lazily and reuses loaded instances where safe. It exposes status and catches unavailable-model errors. Shutdown continues to use the existing model unload lifecycle. The implementation avoids loading a second copy of Whisper, TTS, or LLM models and does not change RVC runtime behavior.

## Storage

All new assistant audio and exported settings use the existing backend storage helpers. Suggested paths are `assistant/audio`, `assistant/config`, and `assistant/models` below the configured data root. On the Windows packaged build this resolves to `E:\Voicebox\sh.voicebox.app`. No assistant code may use the process working directory, `%APPDATA%`, or an independent cache root for user data.

## Implementation order

The implementation order is: additive database tables and initialization; assistant service and provider adapter; explicit tool manager; assistant API routes; frontend Assistant Mode route; text chat; voice selection and TTS response; existing capture/STT connection; memory controls; tests; hosted Windows build.
