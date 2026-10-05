import { AudioWaveform, LibraryBig } from 'lucide-react';
import { HistoryTable } from '@/components/History/HistoryTable';

export function LibraryTab() {
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
        <div className="flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs text-accent">
          <AudioWaveform className="h-3.5 w-3.5" />
          <span>All generated audio</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card/35 p-4 shadow-xl shadow-black/10">
        <HistoryTable />
      </div>
    </div>
  );
}
