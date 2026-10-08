'use client';

import { describeChange, flatten, fold, summarizeSheet } from '@questwright/engine';
import { useEffect } from 'react';
import { useStudio, type AiBackend, type StudioState } from './store';

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

/** Subscription reading: up to this much consecutive prose goes in one request. */
const BATCH_PARAGRAPHS = 40;
const BATCH_CHARS = 24000;

/** The first run of consecutive queued paragraphs in one chapter, in manuscript order. */
function pickBatch(s: StudioState, ready: (pid: string) => boolean): string[] {
  const flat = flatten(s.manuscript);
  const queued = new Set(s.queue.filter(ready));
  const start = flat.findIndex((p) => queued.has(p.id));
  if (start < 0) return [];
  const out: string[] = [];
  let chars = 0;
  for (let i = start; i < flat.length; i++) {
    const p = flat[i]!;
    if (!queued.has(p.id) || p.chapterIndex !== flat[start]!.chapterIndex) break;
    if (out.length && (out.length >= BATCH_PARAGRAPHS || chars + p.text.length > BATCH_CHARS)) break;
    out.push(p.id);
    chars += p.text.length;
  }
  return out;
}

async function runBatch(pids: string[]) {
  const s = useStudio.getState();
  const flat = flatten(s.manuscript);
  const items = pids.map((pid) => flat.find((x) => x.id === pid)).filter((p) => p !== undefined);
  if (!items.length) return;
  const first = items[0]!;
  const before = fold(s.project, s.manuscript, first.index - 1);
  const name = (id: string) => s.project.characters[id]?.name ?? id;
  const sent = items.map((p) => ({ pid: p.id, sentText: p.text }));
  for (const p of items) s.startExtraction(p.id);
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-qw-access': s.accessCode },
      body: JSON.stringify({
        mode: 'batch',
        paragraphs: items.map((p) => ({
          text: p.text,
          parsed: s.project.records
            .filter((r) => r.paragraphId === p.id && r.source === 'parser')
            .map((r) => (r.change.kind === 'merge' ? describeChange(r.change, name) : `${name(r.change.character)}: ${describeChange(r.change, name)}`)),
        })),
        previous: flat[first.index - 1]?.text,
        characters: Object.values(s.project.characters)
          .filter((c) => !c.mergedInto)
          .map((c) => ({ name: c.name, aliases: c.aliases })),
        world: before.world,
        sheets: Object.values(before.sheets)
          .filter((sh) => sh.promoted)
          .map((sh) => summarizeSheet(name(sh.characterId), sh)),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (res.status === 401) useStudio.getState().setAiStatus('locked');
    if (!res.ok || !Array.isArray(data.result)) throw new Error(data.error ?? `The server answered ${res.status}.`);
    const results = data.result as Parameters<StudioState['finishExtraction']>[2][];
    useStudio.getState().finishExtractions(sent.map((x, i) => ({ ...x, result: results[i] ?? { characters: [], changes: [] } })));
  } catch (e) {
    useStudio.getState().failExtractions(sent, e instanceof Error ? e.message : 'Unknown error');
  }
}

async function skim(chapterId: string) {
  const s = useStudio.getState();
  const chapter = s.project.archive?.chapters.find((c) => c.id === chapterId);
  if (!chapter) return s.failSkim(chapterId, 'That chapter is no longer in the archive.');
  s.startSkim(chapterId);
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-qw-access': s.accessCode },
      body: JSON.stringify({
        mode: 'skim',
        chapter: chapter.paragraphs.map((p) => p.text).join('\n\n').slice(0, 200000),
        characters: Object.values(s.project.characters).filter((c) => !c.mergedInto).map((c) => ({ name: c.name, aliases: c.aliases })),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!res.ok || !data.result) throw new Error(data.error ?? `The server answered ${res.status}.`);
    useStudio.getState().finishSkim(chapterId, data.result as Parameters<StudioState['finishSkim']>[1]);
  } catch (e) {
    useStudio.getState().failSkim(chapterId, e instanceof Error ? e.message : 'Unknown error');
  }
}

/** Reads finished paragraphs in the background, a couple at a time; skims archived chapters when nothing else waits. */
export function useExtractor() {
  useEffect(() => {
    const tick = () => {
      const s = useStudio.getState();
      if (!s.hydrated || s.aiStatus !== 'on' || !s.aiEnabled) return;
      const batched = s.aiBackend?.kind === 'claude-cli';
      // Each subscription request is a Claude Code run, so they go one at a time.
      if (s.inFlight.length >= (batched ? 1 : MAX_IN_FLIGHT)) return;
      const idle = Date.now() - s.lastEditAt > IDLE_MS;
      const texts = new Map(s.manuscript.chapters.flatMap((c) => c.paragraphs).map((p) => [p.id, p.text]));
      const ready = (id: string) => !s.inFlight.includes(id) && (idle || id !== s.cursorPid) && s.failed[id] !== texts.get(id);
      if (batched) {
        // Wait for a pause in typing so a batch is not cut short by the paragraph being written.
        const pids = idle ? pickBatch(s, ready) : [];
        if (pids.length) return void runBatch(pids);
      } else {
        const pid = s.queue.find(ready);
        if (pid) return void run(pid);
      }
      const next = s.project.skimPending?.[0];
      if (next && !s.skimming && !s.queue.length && !s.inFlight.length) void skim(next);
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
      .then((r) => r.json() as Promise<{ ai: boolean; locked: boolean; backend: AiBackend['kind'] | null; plan: string | null; cliSignedOut?: boolean }>)
      .then((d) => {
        if (!live) return;
        const backend = d.backend ? { kind: d.backend, plan: d.plan, signedOut: d.cliSignedOut } : null;
        setAiStatus(!d.ai ? 'off' : d.locked ? 'locked' : 'on', backend);
      })
      .catch(() => live && setAiStatus('off', null));
    return () => {
      live = false;
    };
  }, [code, setAiStatus]);
}
