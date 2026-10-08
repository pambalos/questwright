'use client';

import { wordCount } from '@questwright/engine';
import { useRef } from 'react';
import { useStudio } from '@/lib/store';

const WORDS_PER_LEVEL = 500;

export function Header() {
  const s = useStudio();
  const fileRef = useRef<HTMLInputElement>(null);
  const words = wordCount(s.manuscript);
  const level = Math.floor(words / WORDS_PER_LEVEL) + 1;
  const pct = ((words % WORDS_PER_LEVEL) / WORDS_PER_LEVEL) * 100;

  const ai = (() => {
    if (s.aiStatus === 'checking') return { cls: '', text: 'Checking AI…' };
    if (s.aiStatus === 'off') return { cls: 'off', text: 'AI reading off: no server key' };
    if (s.aiStatus === 'locked') return { cls: 'off', text: 'AI reading locked' };
    if (!s.aiEnabled) return { cls: '', text: 'AI reading paused' };
    if (s.inFlight.length) return { cls: 'busy', text: `Reading ${s.inFlight.length} paragraph${s.inFlight.length > 1 ? 's' : ''}…` };
    return { cls: 'on', text: s.queue.length ? `AI reading on · ${s.queue.length} waiting` : 'AI reading on' };
  })();

  const exportBook = () => {
    const blob = new Blob([JSON.stringify({ format: 'questwright', version: 1, project: s.project, doc: s.doc }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${s.project.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'book'}.questwright.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importBook = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (data?.format !== 'questwright' || !data.project?.characters || !Array.isArray(data.project?.records) || data.doc?.type !== 'doc') throw new Error();
      s.importProject({ parsed: {}, extracted: {}, ...data.project }, data.doc);
    } catch {
      s.toast({ kind: 'error', head: 'Import failed', body: 'That file is not a Questwright export.' });
    }
  };

  const confirmReplace = (what: string, act: () => void) => {
    if (window.confirm(`${what} This replaces the book in this browser. Export first if you want to keep it.`)) act();
  };

  return (
    <header className="top">
      <span className="brand">Questwright</span>
      <input className="title-input" aria-label="Book title" value={s.project.title} onChange={(e) => s.setTitle(e.target.value)} />
      <span className="spacer" />
      <div className="xp" title={`${words} words`}>
        <b>Author Lv {level}</b>
        <span className="bar"><i style={{ width: `${pct}%` }} /></span>
        <span>{words.toLocaleString()} words</span>
      </div>
      <span className={`pill ${ai.cls}`}><span className="dot" />{ai.text}</span>
      {s.aiStatus === 'on' && (
        <button className="btn" onClick={() => s.setAiEnabled(!s.aiEnabled)}>{s.aiEnabled ? 'Pause AI' : 'Resume AI'}</button>
      )}
      {s.aiStatus === 'locked' && (
        <button className="btn" onClick={() => { const c = window.prompt('Access code for AI reading'); if (c !== null) s.setAccessCode(c.trim()); }}>Enter access code</button>
      )}
      <div className="menu">
        <button className="btn" onClick={() => confirmReplace('Start a new, empty book?', s.newProject)}>New book</button>
        <button className="btn" onClick={() => confirmReplace('Load the Emberfall sample?', s.loadSample)}>Sample</button>
        <button className="btn" onClick={exportBook}>Export</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBook(f); e.target.value = ''; }} />
      </div>
    </header>
  );
}
