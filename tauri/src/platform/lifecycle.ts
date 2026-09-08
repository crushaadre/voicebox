import { invoke } from '@tauri-apps/api/core';
import { writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { emit, listen } from '@tauri-apps/api/event';
import type { PlatformLifecycle, ServerLogEntry } from '@/platform/types';

class TauriLifecycle implements PlatformLifecycle {
  onServerReady?: () => void;

  async startServer(remote = false, modelsDir?: string | null): Promise<string> {
    try {
      const result = await invoke<string>('start_server', {
        remote,
        modelsDir: modelsDir ?? undefined,
      });
      console.log('Server started:', result);
      this.onServerReady?.();
      return result;
    } catch (error) {
      console.error('Failed to start server:', error);
      // Persist exact error message for post-mortem debugging
      await writeErrorDiagnostic(error);
      throw error;
    }
  }

  async stopServer(): Promise<void> {
    try {
      await invoke('stop_server');
      console.log('Server stopped');
    } catch (error) {
      console.error('Failed to stop server:', error);
      throw error;
    }
  }

  async restartServer(modelsDir?: string | null): Promise<string> {
    try {
      const result = await invoke<string>('restart_server', {
        modelsDir: modelsDir ?? undefined,
      });
      console.log('Server restarted:', result);
      this.onServerReady?.();
      return result;
    } catch (error) {
      console.error('Failed to restart server:', error);
      throw error;
    }
  }

  async setKeepServerRunning(keepRunning: boolean): Promise<void> {
    try {
      await invoke('set_keep_server_running', { keepRunning });
    } catch (error) {
      console.error('Failed to set keep server running setting:', error);
    }
  }

  async getStorageRoot(): Promise<string> {
    return invoke<string>('get_storage_root');
  }

  async changeStorageRoot(newRoot: string, migrate: boolean): Promise<string> {
    const result = await invoke<string>('change_storage_root', { newRoot, migrate });
    this.onServerReady?.();
    return result;
  }

  async setBackendOverride(backend?: string | null): Promise<void> {
    try {
      await invoke('set_backend_override', { backend: backend ?? undefined });
    } catch (error) {
      console.error('Failed to set backend override:', error);
      throw error;
    }
  }

  async setupWindowCloseHandler(): Promise<void> {
    try {
      // Listen for window close request from Rust
      await listen<null>('window-close-requested', async () => {
        // Import store here to avoid circular dependency
        const { useServerStore } = await import('@/stores/serverStore');
        const keepRunning = useServerStore.getState().keepServerRunningOnClose;

        // Check if server was started by this app instance
        // @ts-expect-error - accessing module-level variable from another module
        const serverStartedByApp = window.__voiceboxServerStartedByApp ?? false;

        console.log(
          '[lifecycle] window-close-requested: keepRunning=%s, serverStartedByApp=%s',
          keepRunning,
          serverStartedByApp,
        );

        if (!keepRunning && serverStartedByApp) {
          // Stop server before closing (only if we started it)
          try {
            await this.stopServer();
          } catch (error) {
            console.error('Failed to stop server on close:', error);
          }
        }

        // Emit event back to Rust to allow close
        await emit('window-close-allowed');
      });
    } catch (error) {
      console.error('Failed to setup window close handler:', error);
    }
  }

  subscribeToServerLogs(callback: (entry: ServerLogEntry) => void): () => void {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen<ServerLogEntry>('server-log', (event) => {
      callback(event.payload);
    })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((error) => {
        console.error('Failed to subscribe to server logs:', error);
      });

    return () => {
      disposed = true;
      unlisten?.();
      unlisten = null;
    };
  }
}

async function writeErrorDiagnostic(error: unknown): Promise<void> {
  try {
    const errorStr = error instanceof Error ? error.message : String(error);
    const timestamp = new Date().toISOString();
    const content = `=== Voicebox Server Startup Error ===\nTimestamp: ${timestamp}\nError:\n${errorStr}`;

    // Write to app data directory using BaseDirectory.AppData directly
    await writeTextFile('error_diagnostic.txt', content, {
      baseDir: BaseDirectory.AppData,
    });
    console.log('[Diagnostic] Server error written to app data/error_diagnostic.txt');
  } catch (writeError) {
    // Silent fail: don't let diagnostic write errors alter normal behavior
    console.error('[Diagnostic] Failed to write error file:', writeError);
  }
}

export const tauriLifecycle = new TauriLifecycle();
