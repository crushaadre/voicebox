import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Languages, Loader2, Search } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import type { PatwahEntry, PatwahLibraryResponse, PatwahTranslateResponse } from '@/lib/api/types';

export function PatwahTab() {
  const [library, setLibrary] = useState<PatwahLibraryResponse | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [direction, setDirection] = useState<'patwah-to-english' | 'english-to-patwah'>('patwah-to-english');
  const [text, setText] = useState('');
  const [result, setResult] = useState<PatwahTranslateResponse | null>(null);
  const [recognition, setRecognition] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiClient.getPatwahLibrary().then(setLibrary).catch((err) => {
      setError(err instanceof Error ? err.message : 'Patwah library could not be loaded');
    }).finally(() => setLoading(false));
  }, []);

  const entries = useMemo(() => {
    const source = library?.entries ?? [];
    const needle = query.trim().toLowerCase();
    return source.filter((entry) => {
      const categoryMatches = category === 'all' || entry.category === category;
      const searchMatches = !needle || `${entry.patwah} ${entry.english} ${entry.note}`.toLowerCase().includes(needle);
      return categoryMatches && searchMatches;
    });
  }, [library, query, category]);

  async function translate() {
    if (!text.trim() || translating) return;
    setTranslating(true);
    setError(null);
    try {
      const detected = await apiClient.detectPatwah(text.trim());
      setRecognition(detected.is_patwah
        ? `Patwah detected (${Math.round(detected.confidence * 100)}% confidence${detected.matched_markers.length ? `: ${detected.matched_markers.join(', ')}` : ''}).`
        : 'No strong Patwah markers detected; translation will still use context.');
      setResult(await apiClient.translatePatwah(text.trim(), direction));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setTranslating(false);
    }
  }

  function useEntry(entry: PatwahEntry) {
    setText(direction === 'patwah-to-english' ? entry.patwah : entry.english);
    setResult(null);
    setRecognition(null);
  }

  return (
    <div className="h-full min-h-0 overflow-auto py-6 space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Languages className="h-6 w-6 text-accent" />
          <h1 className="text-2xl font-semibold">Teach Me Patwah</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Learn Jamaican Patwah in context and translate naturally between Patwah and English.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Translator</h2>
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={direction} onChange={(event) => {
            setDirection(event.target.value as typeof direction);
            setResult(null);
            setRecognition(null);
          }}>
            <option value="patwah-to-english">Patwah → English</option>
            <option value="english-to-patwah">English → Patwah</option>
          </select>
        </div>
        <textarea className="w-full min-h-28 rounded-md border border-border bg-background px-3 py-2 text-sm" value={text} onChange={(event) => setText(event.target.value)} placeholder={direction === 'patwah-to-english' ? 'Type something like: Wah gwaan, bredda?' : 'Type an English phrase to translate…'} />
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">The assistant uses the local phrase library first and the local LLM for broader context.</div>
          <button className="rounded-md bg-accent px-4 py-2 text-sm text-accent-foreground disabled:opacity-50" disabled={!text.trim() || translating} onClick={() => void translate()}>
            {translating ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Translating…</> : 'Translate'}
          </button>
        </div>
        {recognition && <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{recognition}</div>}
        {result && <div className="rounded-lg border border-accent/30 bg-accent/5 p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{result.provider}</div><div className="text-lg">{result.translation}</div>{result.matched_entry && <div className="mt-2 text-xs text-muted-foreground">Library meaning: {result.matched_entry.note}</div>}</div>}
        {error && <div className="text-sm text-red-400">{error}</div>}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3"><BookOpen className="h-5 w-5 text-accent" /><h2 className="font-medium">Phrase library</h2></div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-1 min-w-56 items-center gap-2 rounded-md border border-border px-3"><Search className="h-4 w-4 text-muted-foreground" /><input className="w-full bg-transparent py-2 text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search phrases or meanings…" /></label>
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{(library?.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
        {loading ? <div className="text-sm text-muted-foreground">Loading phrase library…</div> : <div className="grid gap-3 md:grid-cols-2">{entries.map((entry) => <button key={`${entry.patwah}-${entry.category}`} className="text-left rounded-lg border border-border p-4 hover:bg-muted/40" onClick={() => useEntry(entry)}><div className="font-medium">{entry.patwah}</div><div className="mt-1 text-sm text-accent">{entry.english}</div><div className="mt-2 text-xs text-muted-foreground">{entry.note}</div><div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{entry.category}</div></button>)}</div>}
        {!loading && !entries.length && <div className="text-sm text-muted-foreground">No matching phrases.</div>}
      </section>
    </div>
  );
}
