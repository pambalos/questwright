'use client';

import { isSystemBox, naturalCompare, splitBook } from '@questwright/engine';
import { useRef, useState } from 'react';
import { useStudio, type SeriesSummary } from '@/lib/store';

interface BookFile {
  title: string;
  text: string;
  words: number;
  prose: number;
  chapters: number;
}

type Line = { ok: boolean | null; text: string };

async function readFile(f: File): Promise<string> {
  if (/\.docx$/i.test(f.name)) {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
    return r.value;
  }
  return f.text();
}

/** Imports a whole series, fully tracking only the latest books and reading them newest first. */
export function SeriesImport({ onClose }: { onClose(): void }) {
  const importSeries = useStudio((s) => s.importSeries);
  const aiStatus = useStudio((s) => s.aiStatus);
  const fileRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<BookFile[]>([]);
  const [keep, setKeep] = useState(4);
  const [skim, setSkim] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<'pick' | 'reading' | 'ready' | 'restoring' | 'done'>('pick');
  const tracked = Math.min(keep, books.length);
  const firstTracked = books.length - tracked;
  const say = (l: Line) => setLines((x) => [...x, l]);
  const pause = () => new Promise((r) => setTimeout(r, 30));

  const pick = async (files: FileList) => {
    const list = [...files].filter((f) => /\.(txt|md|markdown|docx)$/i.test(f.name)).sort((a, b) => naturalCompare(a.name, b.name));
    if (!list.length) return setLines([{ ok: false, text: 'Choose .txt, .md or .docx files, one per book.' }]);
    setPhase('reading');
    setLines([]);
    const out: BookFile[] = [];
    for (const f of list) {
      const title = f.name.replace(/\.[^.]+$/, '');
      try {
        const text = await readFile(f);
        const chapters = splitBook(text, title, 'preview-');
        const paras = chapters.flatMap((c) => c.paragraphs);
        out.push({ title, text, chapters: chapters.length, words: text.match(/\S+/g)?.length ?? 0, prose: paras.filter((p) => !isSystemBox(p.text)).length });
        say({ ok: true, text: `${title}: ${chapters.length} chapters, ${(out[out.length - 1]!.words).toLocaleString()} words` });
      } catch {
        say({ ok: false, text: `${title}: could not be read` });
      }
      await pause();
    }
    setBooks(out);
    setKeep(Math.min(4, out.length));
    setPhase(out.length ? 'ready' : 'pick');
  };

  const start = async () => {
    setPhase('restoring');
    setLines([{ ok: null, text: 'Restoring save file, newest book first…' }]);
    await pause();
    let summary: SeriesSummary;
    try {
      summary = importSeries(books.map((b) => ({ title: b.title, text: b.text })), tracked, skim);
    } catch (e) {
      say({ ok: false, text: `Import failed: ${e instanceof Error ? e.message : 'unknown error'}` });
      return setPhase('ready');
    }
    for (let i = books.length - 1; i >= firstTracked; i--) {
      say({ ok: true, text: i === books.length - 1 ? `${books[i]!.title}: current sheets ready, ${summary.tabs} character tabs` : `${books[i]!.title}: history filled in` });
      await pause();
    }
    say({ ok: true, text: `System boxes parsed across all ${summary.books} books (free): ${summary.systemChanges.toLocaleString()} changes, ${summary.characters} characters` });
    if (firstTracked > 0 && skim) say({ ok: true, text: `${summary.toSkim} chapters of the earlier books queued for a character skim` });
    say({
      ok: aiStatus === 'on' ? true : null,
      text:
        aiStatus === 'on'
          ? `${summary.toRead.toLocaleString()} prose paragraphs queued for AI reading, newest book first`
          : `AI reading is off, so prose finds will be read once it is on (${summary.toRead.toLocaleString()} paragraphs)`,
    });
    if (firstTracked > 0)
      say({ ok: summary.unconfirmed ? null : true, text: summary.unconfirmed ? `Opening snapshot at ${summary.windowLabel}: ${summary.unconfirmed} value${summary.unconfirmed === 1 ? "" : "s"} to confirm, marked ?` : `Opening snapshot at ${summary.windowLabel}: nothing to confirm` });
    setPhase('done');
  };

  const est = books.slice(firstTracked).reduce((n, b) => n + b.prose, 0);
  const skimChapters = books.slice(0, firstTracked).reduce((n, b) => n + b.chapters, 0);

  return (
    <div className="modal" role="presentation" onClick={(e) => e.target === e.currentTarget && phase !== 'restoring' && onClose()}>
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="series-title">
        <h2 id="series-title">Import a series</h2>
        <p>
          One file per book (.txt, .md or .docx), named so they sort in order. Only the latest books are fully tracked. The free system-box parser still reads every book, and earlier books are kept read-only.
        </p>
        {phase === 'pick' && (
          <button className="go" onClick={() => fileRef.current?.click()}>Choose book files</button>
        )}
        <input ref={fileRef} type="file" multiple accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => e.target.files && void pick(e.target.files)} />
        {books.length > 0 && phase !== 'pick' && (
          <>
            <label htmlFor="keep">
              <span>Track the latest</span>
              <b>{tracked} of {books.length} book{books.length > 1 ? 's' : ''}</b>
            </label>
            <input id="keep" type="range" min={1} max={books.length} value={tracked} disabled={phase !== 'ready'} onChange={(e) => setKeep(Number(e.target.value))} />
            <div className="books" style={{ gridTemplateColumns: `repeat(${books.length}, minmax(0, 1fr))` }}>
              {books.map((b, i) => <i key={b.title} title={b.title} className={i >= firstTracked ? (phase === 'done' ? 'done' : 'win') : ''} />)}
            </div>
            {phase === 'ready' && (
              <>
                <p>
                  AI reading for the tracked books: about {est.toLocaleString()} requests, one per prose paragraph, run in the background newest book first. Pause it any time from the header.
                </p>
                {firstTracked > 0 && (
                  <label className="check">
                    <input type="checkbox" checked={skim} onChange={(e) => setSkim(e.target.checked)} />
                    <span>Skim books 1–{firstTracked} for characters too (about {skimChapters.toLocaleString()} more requests, one per chapter)</span>
                  </label>
                )}
              </>
            )}
          </>
        )}
        <div className="steps" aria-live="polite">
          {lines.map((l, i) => (
            <div key={i}>
              <span className={l.ok === null ? 'q' : l.ok ? 'ok' : 'bad'}>{l.ok === null ? '…' : l.ok ? '✓' : '✕'}</span>
              {l.text}
            </div>
          ))}
        </div>
        <div className="acts">
          <button onClick={onClose} disabled={phase === 'restoring'}>{phase === 'done' ? 'Done' : 'Cancel'}</button>
          {phase === 'ready' && <button className="go" onClick={() => void start()}>Restore save file</button>}
        </div>
      </div>
    </div>
  );
}
