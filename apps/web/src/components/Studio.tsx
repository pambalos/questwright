'use client';

import { flatten, fold } from '@questwright/engine';
import { useMemo } from 'react';
import { useAiStatus, useExtractor } from '@/lib/extractor';
import { useStudio } from '@/lib/store';
import { BookTabs } from './BookTabs';
import { Editor } from './Editor';
import { Header } from './Header';
import { Panel } from './Panel';

export function Studio() {
  useAiStatus();
  useExtractor();
  const project = useStudio((s) => s.project);
  const manuscript = useStudio((s) => s.manuscript);
  const cursorPid = useStudio((s) => s.cursorPid);
  const scrub = useStudio((s) => s.scrub);
  const hydrated = useStudio((s) => s.hydrated);

  const flat = useMemo(() => flatten(manuscript), [manuscript]);
  const cursorIndex = flat.find((p) => p.id === cursorPid)?.index;
  const viewIndex = scrub ?? cursorIndex ?? flat.length - 1;
  const latest = useMemo(() => fold(project, manuscript), [project, manuscript]);
  const view = useMemo(() => fold(project, manuscript, viewIndex), [project, manuscript, viewIndex]);

  if (!hydrated) return <p style={{ padding: 24 }}>Opening your book…</p>;

  return (
    <div className="app">
      <Header />
      <BookTabs />
      <div className="main">
        <Editor latest={latest} viewPid={scrub !== null ? flat[scrub]?.id ?? null : null} />
        <Panel view={view} latest={latest} flat={flat} viewIndex={viewIndex} />
      </div>
    </div>
  );
}
