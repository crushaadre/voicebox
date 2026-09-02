import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useServerStore } from '@/stores/serverStore';

type RvcStatus = {
  root: string;
  models: string[];
  indices: string[];
  hubert_ready: boolean;
  rmvpe_ready: boolean;
  ready: boolean;
};

export function RvcTab() {
  const serverUrl = useServerStore((state) => state.serverUrl);
  const [status, setStatus] = useState<RvcStatus | null>(null);
  const [source, setSource] = useState<File | null>(null);
  const [model, setModel] = useState('');
  const [index, setIndex] = useState('');
  const [pitch, setPitch] = useState(0);
  const [indexRate, setIndexRate] = useState(0.75);
  const [protect, setProtect] = useState(0.33);
  const [outputFormat, setOutputFormat] = useState<'wav' | 'mp3'>('wav');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('voicebox-rvc-output.wav');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const refresh = async () => {
    try {
      const response = await fetch(`${serverUrl}/rvc/status`);
      if (!response.ok) throw new Error('Could not read RVC status');
      const next = (await response.json()) as RvcStatus;
      setStatus(next);
      if (!model && next.models[0]) setModel(next.models[0]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'RVC status unavailable');
    }
  };

  useEffect(() => {
    void refresh();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [serverUrl]);

  const startRecording = async () => {
    setMessage('');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      setSource(new File([blob], 'voicebox-recording.webm', { type: blob.type }));
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const convert = async () => {
    if (!source) return setMessage('Record or choose a vocal file first.');
    if (!model) return setMessage('Add an RVC .pth voice model to the E-drive RVC models folder first.');
    const form = new FormData();
    form.append('source', source);
    form.append('model', model);
    form.append('index', index);
    form.append('pitch', String(pitch));
    form.append('index_rate', String(indexRate));
    form.append('protect', String(protect));
    form.append('output_format', outputFormat);
    setBusy(true);
    setMessage('Converting vocal offline. This can take several minutes on CPU.');
    try {
      const response = await fetch(`${serverUrl}/rvc/convert`, { method: 'POST', body: form });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(String(detail.detail || 'RVC conversion failed'));
      }
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(await response.blob());
      setResultUrl(url);
      setResultName(`voicebox-rvc-output.${outputFormat}`);
      setMessage('Conversion complete. Listen below or download the converted vocal.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'RVC conversion failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto py-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">RVC Vocal Converter</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Record or import your lyrics, then convert the vocal timbre with a local RVC model. The original waveform is used as the source, so phrasing, pauses, cadence, and timing are retained as closely as RVC allows.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap gap-3">
          {!recording ? (
            <Button onClick={() => void startRecording()}><Mic className="mr-2 h-4 w-4" />Record lyrics</Button>
          ) : (
            <Button variant="destructive" onClick={stopRecording}><Square className="mr-2 h-4 w-4" />Stop recording</Button>
          )}
          <label className="inline-flex items-center justify-center gap-2 rounded-full border border-input bg-background hover:bg-accent hover:border-accent hover:text-accent-foreground h-10 px-4 py-2 text-sm font-medium cursor-pointer">
            <Upload className="h-4 w-4" />Choose WAV or MP3
            <input className="hidden" type="file" accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3,.flac,.m4a" onChange={(event) => setSource(event.target.files?.[0] ?? null)} />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">Source: <span className="text-foreground">{source?.name ?? 'Nothing selected'}</span></p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Voice model and conversion</h2>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
        <p className="text-xs text-muted-foreground">RVC files are kept under the storage root below. Put your permitted <code>.pth</code> voice models in the models folder and optional <code>.index</code> files in the indices folder.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm space-y-2"><span>Voice model (.pth)</span><select className="w-full rounded-md border border-input bg-background px-3 py-2" value={model} onChange={(event) => setModel(event.target.value)}><option value="">Select a model</option>{status?.models.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-sm space-y-2"><span>Retrieval index (optional)</span><select className="w-full rounded-md border border-input bg-background px-3 py-2" value={index} onChange={(event) => setIndex(event.target.value)}><option value="">No index</option>{status?.indices.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-sm space-y-2"><span>Pitch shift: {pitch} semitones</span><input className="w-full" type="range" min={-12} max={12} value={pitch} onChange={(event) => setPitch(Number(event.target.value))} /></label>
          <label className="text-sm space-y-2"><span>Index mix: {indexRate.toFixed(2)}</span><input className="w-full" type="range" min={0} max={1} step={0.01} value={indexRate} onChange={(event) => setIndexRate(Number(event.target.value))} /></label>
          <label className="text-sm space-y-2"><span>Protection: {protect.toFixed(2)}</span><input className="w-full" type="range" min={0} max={0.5} step={0.01} value={protect} onChange={(event) => setProtect(Number(event.target.value))} /></label>
          <label className="text-sm space-y-2"><span>Output format</span><select className="w-full rounded-md border border-input bg-background px-3 py-2" value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as 'wav' | 'mp3')}><option value="wav">WAV</option><option value="mp3">MP3</option></select></label>
        </div>
        <p className="text-xs text-muted-foreground">RVC changes voice timbre and may change pitch details or introduce artifacts; it does not guarantee sample-perfect timing.</p>
        <Button onClick={() => void convert()} disabled={busy || !source || !model}>{busy ? 'Converting…' : 'Convert vocal'}</Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {status && <p className="text-xs text-muted-foreground">Storage root: <code>{status.root}</code> · Base assets: {status.hubert_ready && status.rmvpe_ready ? 'ready' : 'not installed yet'}</p>}
      </div>
      {resultUrl && <div className="rounded-xl border border-border bg-card p-5 space-y-4"><h2 className="font-medium">Converted vocal</h2><audio className="w-full" controls src={resultUrl} /><a className="inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground h-10 px-4 py-2 text-sm font-medium" href={resultUrl} download={resultName}><Download className="h-4 w-4" />Download {resultName}</a></div>}
      <p className="text-xs text-muted-foreground">Use only voice models and recordings you have permission to use, and follow each model’s license.</p>
    </div>
  );
}
