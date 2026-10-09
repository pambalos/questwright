'use client';

import {
  artPrompt,
  defaultAspect,
  fold,
  illustrationSignature,
  paintable,
  type ArtDirection,
  type ArtExtra,
  type CompendiumEntry,
  type Illustration,
  type Project,
  type WorldState,
} from '@questwright/engine';
import { useEffect, useState } from 'react';
import { idbGet, idbSet } from './idb-storage';
import { newId } from './ids';
import { PROVIDERS } from './image-providers';
import { imageKey, thisMonth, useStudio } from './store';

/* ---------- stored images ---------- */

const urls = new Map<string, string>();

/** An object URL for a stored painting, or null while it loads (or if it is gone). */
export function useImage(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(id ? (urls.get(id) ?? null) : null);
  useEffect(() => {
    if (!id) return setUrl(null);
    const known = urls.get(id);
    if (known) return setUrl(known);
    let live = true;
    setUrl(null);
    void idbGet<Blob>(imageKey(id))
      .then((b) => {
        if (!b || !live) return;
        const u = urls.get(id) ?? URL.createObjectURL(b);
        urls.set(id, u);
        setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}

function b64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** A stored painting, shrunk to send as a reference. */
async function asReference(id: string, role: 'subject' | 'style') {
  const blob = await idbGet<Blob>(imageKey(id)).catch(() => undefined);
  if (!blob) return null;
  // An <img> decodes more leniently than createImageBitmap.
  const src = URL.createObjectURL(blob);
  const bmp = new Image();
  bmp.src = src;
  try {
    await bmp.decode();
  } catch {
    URL.revokeObjectURL(src);
    return null;
  }
  const scale = Math.min(1, 1024 / Math.max(bmp.naturalWidth, bmp.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.naturalWidth * scale);
  canvas.height = Math.round(bmp.naturalHeight * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(src);
  const url = canvas.toDataURL('image/jpeg', 0.9);
  return { role, mime: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}

/* ---------- what a painting of an entry depends on ---------- */

export function artExtra(project: Project, state: WorldState, e: CompendiumEntry): ArtExtra {
  const c = e.characterId ? project.characters[e.characterId] : undefined;
  const sheet = e.characterId ? state.sheets[e.characterId] : undefined;
  const gear = sheet ? Object.entries(sheet.equipment).map(([slot, { item, rarity }]) => `${slot}: ${item}${rarity && rarity !== 'common' ? ` (${rarity})` : ''}`) : [];
  const l = c?.look;
  return {
    role: c?.role,
    description: c?.description,
    gear,
    look: l ? `skin ${l.skin}, ${l.hair} hair coloured ${l.hairColor}, clothing ${l.cloth} with ${l.accent} accents, ${l.build > 1.05 ? 'tall' : l.build < 0.95 ? 'short' : 'average height'}` : undefined,
  };
}

/** A painting of the entry is due: it has none that matches how it looks now. */
export function stale(project: Project, state: WorldState, e: CompendiumEntry): boolean {
  const last = project.illustrations?.[e.key]?.versions.at(-1);
  return !last || last.signature !== illustrationSignature(e, artExtra(project, state, e));
}

/* ---------- painting ---------- */

let chain: Promise<unknown> = Promise.resolve();

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-qw-access': useStudio.getState().accessCode }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `The server answered ${res.status}.`);
  return data;
}

/**
 * Paints an entry: Claude writes the image prompt from what the book
 * remembers, then the chosen image service paints it, keeping the approved
 * portrait and the house style as references. Paintings run one at a time.
 */
export function illustrate(key: string, opts: { auto?: boolean } = {}): Promise<void> {
  const st = useStudio.getState();
  if (st.painting.includes(key)) return Promise.resolve();
  st.setPainting([...st.painting, key]);
  const done = () => {
    const s = useStudio.getState();
    s.setPainting(s.painting.filter((k) => k !== key));
  };
  const run = chain.then(async () => {
    const s = useStudio.getState();
    const { provider, quality } = s.images;
    const info = PROVIDERS[provider];
    if (!s.imageKeys[provider]) throw new Error(`Add a ${info.company} key in Settings to paint with ${info.label}.`);
    const state = fold(s.project, s.manuscript);
    const e = state.compendium.find((x) => x.key === key);
    if (!e) throw new Error('That entry is no longer in the compendium.');
    const extra = artExtra(s.project, state, e);
    const signature = illustrationSignature(e, extra);

    const approved = s.project.illustrations?.[key]?.approved;
    const refs = (
      await Promise.all([
        approved ? asReference(approved, 'subject') : null,
        ...(s.project.styleRefs ?? []).filter((id) => id !== approved).map((id) => asReference(id, 'style')),
      ])
    ).filter((r): r is NonNullable<typeof r> => r !== null);
    const notes = artPrompt(e, { ...extra, references: { subject: refs.some((r) => r.role === 'subject'), style: refs.filter((r) => r.role === 'style').length } });

    // Without the AI, the notes themselves are a usable (if plainer) prompt.
    const art: ArtDirection =
      s.aiStatus === 'on'
        ? (await post<{ result: ArtDirection }>('/api/extract', { mode: 'art', notes })).result
        : { prompt: notes.replace('Style paragraph to end with:\n', ''), caption: e.name, aspect: defaultAspect(e.category) };
    const painted = await post<{ mime: string; data: string; model: string }>('/api/illustrate', { provider, quality, prompt: art.prompt, aspect: art.aspect, refs });

    const ill: Illustration = {
      id: newId(),
      provider,
      model: painted.model,
      prompt: art.prompt,
      caption: art.caption,
      aspect: art.aspect,
      signature,
      createdAt: Date.now(),
      cost: info.cost[quality],
      ...(opts.auto ? { auto: true } : {}),
    };
    await idbSet(imageKey(ill.id), b64ToBlob(painted.data, painted.mime));
    // An automatic repaint keeps the codex current; one asked for by hand waits for the author to approve it (unless it is the first).
    useStudio.getState().addIllustration(key, ill, opts.auto);
  });
  chain = run.catch(() => undefined);
  return run
    .catch((err: unknown) => {
      useStudio.getState().toast({ kind: 'error', head: `Could not paint ${key.replace(/^(char|lore):/, '')}`, body: err instanceof Error ? err.message : 'Try again.' });
    })
    .finally(done);
}

/** Money left under the monthly cap for automatic painting. */
export function autoBudget(): number {
  const s = useStudio.getState();
  const spent = s.imageSpend.month === thisMonth() ? s.imageSpend.usd : 0;
  return s.images.monthlyCap - spent;
}

/**
 * Automatic painting: when an entry gains a description or its look changes
 * (new traits, new gear) while the book is open, it is painted again, a short
 * while after the reading settles. Entries as they were when the book opened
 * are left alone, so turning this on does not repaint a whole library.
 */
export function useAutoIllustrate() {
  useEffect(() => {
    let seen = new Map<string, string>();
    let book = '';
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      timer = null;
      const s = useStudio.getState();
      const state = fold(s.project, s.manuscript);
      const sigs = new Map(state.compendium.map((e) => [e.key, illustrationSignature(e, artExtra(s.project, state, e))]));
      if (book !== s.project.id) {
        book = s.project.id;
        seen = sigs;
        return;
      }
      const changed = state.compendium.filter((e) => seen.get(e.key) !== sigs.get(e.key));
      seen = sigs;
      if (!s.images.auto || !s.imageKeys[s.images.provider]) return;
      const cost = PROVIDERS[s.images.provider].cost[s.images.quality];
      let budget = autoBudget();
      for (const e of changed) {
        if (budget < cost) break;
        if (!paintable(e, artExtra(s.project, state, e)) || !stale(s.project, state, e) || s.painting.includes(e.key)) continue;
        budget -= cost;
        void illustrate(e.key, { auto: true });
      }
    };
    const unsub = useStudio.subscribe((s, prev) => {
      if (s.hydrated !== prev.hydrated) {
        book = '';
        return check();
      }
      if (s.project === prev.project && s.manuscript === prev.manuscript) return;
      if (s.project.id !== book) return check();
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, 15000);
    });
    if (useStudio.getState().hydrated) check();
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
