import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, Mic, Plus, Send, Volume2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useServerStore } from '@/stores/serverStore';
import type {
  AssistantMessage,
  AssistantSession,
  AssistantSettings,
  AssistantVoice,
} from '@/lib/api/types';

export function AssistantTab() {
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [voices, setVoices] = useState<AssistantVoice[]>([]);
  const [sessions, setSessions] = useState<AssistantSession[]>([]);
  const [session, setSession] = useState<AssistantSession | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [speakResponse, setSpeakResponse] = useState(true);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.id === settings?.voice_profile_id),
    [voices, settings?.voice_profile_id],
  );

  async function load() {
    try {
      setLoading(true);
      const [nextSettings, nextVoices, nextSessions] = await Promise.all([
        apiClient.getAssistantSettings(),
        apiClient.listAssistantVoices(),
        apiClient.listAssistantSessions(),
      ]);
      setSettings(nextSettings);
      setVoices(nextVoices);
      setSessions(nextSessions);
      const nextSession = nextSessions[0] ?? (await apiClient.createAssistantSession());
      setSession(nextSession);
      setMessages(await apiClient.listAssistantMessages(nextSession.id));
      if (!nextSessions.length) setSessions([nextSession]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant could not be loaded');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createSession() {
    const next = await apiClient.createAssistantSession();
    setSession(next);
    setMessages([]);
    setSessions((current) => [next, ...current]);
  }

  async function selectSession(next: AssistantSession) {
    setSession(next);
    setMessages(await apiClient.listAssistantMessages(next.id));
  }

  async function updateVoice(profileId: string) {
    if (!settings) return;
    const next = await apiClient.updateAssistantSettings({ voice_profile_id: profileId });
    setSettings(next);
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!session || !chunksRef.current.length) return;
        setSending(true);
        try {
          const result = await apiClient.assistantVoiceChat(
            session.id,
            new File(chunksRef.current, 'assistant-recording.webm', { type: recorder.mimeType || 'audio/webm' }),
            { speak_response: speakResponse, remember },
          );
          setMessages((current) => [...current, result.user_message, result.assistant_message]);
          setSession(result.session);
          if (result.audio_path) {
            const filename = result.audio_path.split(/[\\/]/).pop();
            if (filename) setAudioUrl(`${useServerStore.getState().serverUrl}/assistant/audio/${encodeURIComponent(filename)}`);
          }
          setRemember(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Voice chat failed');
        } finally {
          setSending(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access failed');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function sendMessage() {
    if (!session || !text.trim() || sending) return;
    const outgoing = text.trim();
    setText('');
    setSending(true);
    setError(null);
    try {
      const result = await apiClient.chatWithAssistant(session.id, outgoing, {
        speak_response: speakResponse,
        remember,
      });
      setMessages((current) => [...current, result.user_message, result.assistant_message]);
      if (result.audio_path) {
        const filename = result.audio_path.split(/[\\/]/).pop();
        if (filename) {
          setAudioUrl(`${useServerStore.getState().serverUrl}/assistant/audio/${encodeURIComponent(filename)}`);
        }
      }
      setSession(result.session);
      setSessions((current) => current.map((item) => (item.id === result.session.id ? result.session : item)));
      setRemember(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant request failed');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">Loading Assistant Mode…</div>;
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-5 py-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-accent" />
            <h1 className="text-2xl font-semibold">Assistant Mode</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Local conversation using Voicebox models and voices.
          </p>
        </div>
        <button className="px-3 py-2 rounded-md border border-border hover:bg-muted/50" onClick={() => void createSession()}>
          <Plus className="inline h-4 w-4 mr-1" /> New chat
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[220px_1fr] gap-4">
        <aside className="rounded-lg border border-border p-3 overflow-auto">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Conversations</div>
          {sessions.map((item) => (
            <button
              key={item.id}
              className={`block w-full text-left rounded-md px-3 py-2 text-sm mb-1 ${session?.id === item.id ? 'bg-accent/15 text-foreground' : 'hover:bg-muted/50 text-muted-foreground'}`}
              onClick={() => void selectSession(item)}
            >
              {item.title}
            </button>
          ))}
        </aside>

        <section className="min-h-0 flex flex-col rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">{settings?.assistant_name ?? 'Assistant'}</div>
            <div className="flex items-center gap-2 text-sm">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <select
                className="bg-transparent border border-border rounded px-2 py-1"
                value={settings?.voice_profile_id ?? ''}
                onChange={(event) => void updateVoice(event.target.value)}
              >
                <option value="">Text only</option>
                {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">{selectedVoice ? selectedVoice.name : 'No voice selected'}</span>
            </div>
            {audioUrl && <audio className="mt-2 w-full" controls src={audioUrl} />}
          </div>

          <div className="flex-1 overflow-auto p-5 space-y-4">
            {!messages.length && <div className="text-center text-muted-foreground py-16">Start a local conversation.</div>}
            {messages.map((message) => (
              <div key={message.id} className={`max-w-[80%] rounded-lg px-4 py-3 ${message.role === 'user' ? 'ml-auto bg-accent/15' : 'bg-muted/40'}`}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{message.role}</div>
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>
              </div>
            ))}
            {sending && <div className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Thinking locally…</div>}
          </div>

          <div className="border-t border-border p-4">
            {error && <div className="text-sm text-red-400 mb-2">{error}</div>}
            <textarea
              className="w-full min-h-20 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Message your local assistant…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void sendMessage(); }}
            />
            <div className="flex items-center justify-between mt-3 gap-4">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <label><input type="checkbox" checked={speakResponse} onChange={(event) => setSpeakResponse(event.target.checked)} className="mr-1" /> Speak response</label>
                <label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="mr-1" /> Remember this</label>
              </div>
              <div className="flex items-center gap-2">
                <button className={`px-3 py-2 rounded-md border border-border ${recording ? 'bg-red-500/20 text-red-300' : 'hover:bg-muted/50'}`} disabled={sending} onClick={() => recording ? stopRecording() : void startRecording()}>
                  <Mic className="inline h-4 w-4 mr-1" /> {recording ? 'Stop' : 'Talk'}
                </button>
                <button className="px-4 py-2 rounded-md bg-accent text-accent-foreground disabled:opacity-50" disabled={!text.trim() || sending} onClick={() => void sendMessage()}>
                  <Send className="inline h-4 w-4 mr-1" /> Send
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
