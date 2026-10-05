import { useState } from 'react';
import { AudioWaveform, LibraryBig, Search } from 'lucide-react';
import { HistoryTable } from '@/components/History/HistoryTable';

export function LibraryTab() {
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');

  return (
    <div className="h-full min-h-0 flex flex-col gap-5 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <LibraryBig className="h-6 w-6 text-accent" />
            <h1 className="text-2xl font-semibold">Library</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your reusable audio workspace for Voice Studio, Assistant, imports, and future RVC creations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="library-source">Filter library source</label>
          <select id="library-source" className="rounded-full border border-border bg-card px-3 py-1.5 text-xs" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">All sources</option>
            <option value="manual">Voice Studio</option>
            <option value="assistant">Assistant</option>
            <option value="rvc">RVC</option>
            <option value="import">Imported audio</option>
          </select>
          <div className="flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs text-accent">
            <AudioWaveform className="h-3.5 w-3.5" />
            <span>{source ? source : 'All generated audio'}</span>
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="sr-only">Search Library</span>
        <input className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transcripts and assistant responses…" />
      </label>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card/35 p-4 shadow-xl shadow-black/10">
        <HistoryTable source={source || undefined} search={search || undefined} />
      </div>
    </div>
  );
}
