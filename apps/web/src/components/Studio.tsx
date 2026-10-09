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
  const render = useStudio((s) => s.project.art?.render ?? 'anime');
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
    <div className={`app render-${render}`}>
      {/* The storybook look for 2D figures: a hand's wobble and sepia ink. */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <filter id="qw-sketch" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="7" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="drawn" />
          <feColorMatrix in="drawn" type="matrix" values="0.40 0.50 0.12 0 0.04  0.35 0.45 0.10 0 0.03  0.26 0.34 0.08 0 0.02  0 0 0 1 0" />
        </filter>
      </svg>
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
