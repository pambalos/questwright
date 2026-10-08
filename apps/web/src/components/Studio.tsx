'use client';

import { flatten, fold } from '@questwright/engine';
import { useEffect, useMemo, useRef } from 'react';
import { useAiStatus, useExtractor } from '@/lib/extractor';
import { useStudio } from '@/lib/store';
import { BookTabs } from './BookTabs';
import { Editor } from './Editor';
import { Header } from './Header';
import { Panel } from './Panel';
import { PanelDivider } from './PanelDivider';

export function Studio() {
  useAiStatus();
  useExtractor();
  const project = useStudio((s) => s.project);
  const manuscript = useStudio((s) => s.manuscript);
  const cursorPid = useStudio((s) => s.cursorPid);
  const scrub = useStudio((s) => s.scrub);
  const hydrated = useStudio((s) => s.hydrated);
  const panelWidth = useStudio((s) => s.panelWidth);
  const panelMode = useStudio((s) => s.panelMode);
  const setPanelMode = useStudio((s) => s.setPanelMode);
  const layout = useRef<HTMLDivElement>(null);

  const flat = useMemo(() => flatten(manuscript), [manuscript]);
  const cursorIndex = flat.find((p) => p.id === cursorPid)?.index;
  const viewIndex = scrub ?? cursorIndex ?? flat.length - 1;
  const latest = useMemo(() => fold(project, manuscript), [project, manuscript]);
  const view = useMemo(() => fold(project, manuscript, viewIndex), [project, manuscript, viewIndex]);

  // Ctrl+\ folds the panel into its icon bar and back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        const mode = useStudio.getState().panelMode;
        setPanelMode(mode === 'mini' ? 'open' : 'mini');
      }
      if (e.key === 'Escape' && useStudio.getState().panelMode === 'full') setPanelMode('open');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPanelMode]);

  if (!hydrated) return <p style={{ padding: 24 }}>Opening your book…</p>;

  return (
    <div className="app">
      <Header />
      <BookTabs />
      <div ref={layout} className={`main panel-${panelMode}`} style={{ '--panel-w': `${panelWidth}px` } as React.CSSProperties}>
        <Editor latest={latest} viewPid={scrub !== null ? flat[scrub]?.id ?? null : null} />
        {panelMode === 'open' && <PanelDivider layout={layout} />}
        <Panel view={view} latest={latest} flat={flat} viewIndex={viewIndex} />
      </div>
    </div>
  );
}
