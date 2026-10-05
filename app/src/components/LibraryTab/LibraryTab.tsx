import { useState } from 'react';
import { AudioWaveform, LibraryBig } from 'lucide-react';
import { HistoryTable } from '@/components/History/HistoryTable';

export function LibraryTab() {
  const [source, setSource] = useState('');

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
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card/35 p-4 shadow-xl shadow-black/10">
        <HistoryTable source={source || undefined} />
      </div>
    </div>
  );
}
