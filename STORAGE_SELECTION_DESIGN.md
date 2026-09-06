# Selectable Storage Root Design

## User-facing behavior

The application keeps `E:\Voicebox\sh.voicebox.app` as the initial Windows default for the current user, but the path is no longer hard-coded. Settings will show the active storage root and provide **Choose folder** and **Move data** actions. The user may choose any accessible local directory on another drive, such as `D:\VoiceboxData` or `F:\Voicebox`.

Changing the folder is an explicit operation. The application will display the source and destination, estimate the data to be copied, warn that the backend must restart, and require confirmation before moving files. A failed copy leaves the original root intact and does not change the persisted active root.

## Persistence

The selected root is persisted in a small desktop configuration file under the operating system’s application configuration directory, not inside the selected storage root. This is necessary because the app must remember the selected root even when the old root is unavailable or the user changes drives. The persisted value is a normalized absolute path. If no selection exists, Windows defaults to `E:\Voicebox\sh.voicebox.app`; other platforms keep their normal application-data behavior.

## Startup

Tauri resolves the persisted root before launching the backend. It passes the resolved root through `VOICEBOX_STORAGE_DIR` and the existing `--data-dir` argument. The Python backend continues to use its existing `config.get_data_dir()` helpers, so the database, profiles, generations, captures, cache, RVC directories, Assistant audio, and model metadata follow the selected root automatically.

## Models and cache

The full storage root controls Voicebox-owned data. The separate model-cache override remains supported for advanced users, but the default model directory becomes `<selected-root>\\models`. The settings UI will make the distinction explicit so users do not accidentally move only the model cache while leaving the database and generations on another drive.

## Migration modes

The first implementation supports a safe copy-based migration. The user chooses a destination, confirms the operation, and the app copies the full data tree while preserving relative paths. After the copy is verified, the app writes the new root to its desktop configuration and restarts the backend. The original root is retained until the user manually deletes it after verifying the new installation. A future cleanup action can delete the old root only after a separate confirmation.

If the destination already contains Voicebox data, the UI will not silently overwrite it. It will require an explicit merge/replace decision or ask the user to choose an empty directory. The safest initial behavior is to require an empty or nonexistent destination.

## Safety checks

The picker rejects files, inaccessible paths, the filesystem root, and a destination nested inside the current data root. The migration uses a temporary destination marker and copies files without following unsafe links. The backend is stopped before a copy begins and restarted only after the active-root configuration is committed. If restart fails, the UI reports the failure and leaves the copied destination available for recovery while retaining the old root configuration.

## Compatibility

Existing database paths remain relative where possible. The backend’s current `resolve_storage_path` logic continues to rebase legacy absolute paths containing the old `data` directory. The migration copies the database and all referenced media together, preserving those relative paths. RVC models, indexes, Assistant audio, Assistant database records, Voicebox profiles, captures, generations, and model files therefore move as one coherent tree.
