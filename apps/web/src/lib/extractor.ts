'use client';

import { describeChange, flatten, fold, summarizeSheet } from '@questwright/engine';
import { useEffect } from 'react';
import { useStudio, type StudioState } from './store';

const MAX_IN_FLIGHT = 2;
/** How long the author must stop typing before the paragraph under the cursor is read. */
const IDLE_MS = 4000;

function requestFor(s: StudioState, pid: string) {
  const flat = flatten(s.manuscript);
  const p = flat.find((x) => x.id === pid);
  if (!p) return null;
  const before = fold(s.project, s.manuscript, p.index - 1);
  const name = (id: string) => s.project.characters[id]?.name ?? id;
  return {
    text: p.text,
    body: {
      paragraph: p.text,
      previous: flat[p.index - 1]?.text,
      characters: Object.values(s.project.characters)
        .filter((c) => !c.mergedInto)
        .map((c) => ({ name: c.name, aliases: c.aliases })),
      world: before.world,
      sheets: Object.values(before.sheets)
        .filter((sh) => sh.promoted)
        .map((sh) => summarizeSheet(name(sh.characterId), sh)),
      parsed: s.project.records
        .filter((r) => r.paragraphId === pid && r.source === 'parser')
        .map((r) => (r.change.kind === 'merge' ? describeChange(r.change, name) : `${name(r.change.character)}: ${describeChange(r.change, name)}`)),
    },
  };
}

async function run(pid: string) {
  const s = useStudio.getState();
  const req = requestFor(s, pid);
  if (!req) return;
  s.startExtraction(pid);
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-qw-access': s.accessCode },
      body: JSON.stringify(req.body),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (res.status === 401) useStudio.getState().setAiStatus('locked');
    if (!res.ok || !data.result) throw new Error(data.error ?? `The server answered ${res.status}.`);
    useStudio.getState().finishExtraction(pid, req.text, data.result as Parameters<StudioState['finishExtraction']>[2]);
  } catch (e) {
    useStudio.getState().failExtraction(pid, req.text, e instanceof Error ? e.message : 'Unknown error');
  }
}

/** Reads finished paragraphs in the background, a couple at a time. */
export function useExtractor() {
  useEffect(() => {
    const tick = () => {
      const s = useStudio.getState();
      if (s.aiStatus !== 'on' || !s.aiEnabled || s.inFlight.length >= MAX_IN_FLIGHT) return;
      const idle = Date.now() - s.lastEditAt > IDLE_MS;
      const texts = new Map(s.manuscript.chapters.flatMap((c) => c.paragraphs).map((p) => [p.id, p.text]));
      const pid = s.queue.find((id) => !s.inFlight.includes(id) && (idle || id !== s.cursorPid) && s.failed[id] !== texts.get(id));
      if (pid) void run(pid);
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
}

/** Asks the server whether AI extraction is available for this browser. */
export function useAiStatus() {
  const code = useStudio((s) => s.accessCode);
  const setAiStatus = useStudio((s) => s.setAiStatus);
  useEffect(() => {
    let live = true;
    fetch('/api/status', { headers: { 'x-qw-access': code } })
      .then((r) => r.json() as Promise<{ ai: boolean; locked: boolean }>)
      .then((d) => live && setAiStatus(!d.ai ? 'off' : d.locked ? 'locked' : 'on'))
      .catch(() => live && setAiStatus('off'));
    return () => {
      live = false;
    };
  }, [code, setAiStatus]);
}
