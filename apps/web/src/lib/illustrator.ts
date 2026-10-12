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
import { useEffect, useMemo, useState } from 'react';
import { idbGet, idbSet } from './idb-storage';
import { newId } from './ids';
import { PROVIDERS, type ImageProvider } from './image-providers';
import { localModel, type LocalModel, type LocalStatus } from './local-catalog';
import { imageKey, thisMonth, useStudio, type ImageSettings } from './store';

/* ---------- who paints ---------- */

export interface PainterInfo {
  label: string;
  /** Where it runs: a company, or this computer. */
  where: string;
  ready: boolean;
  /** What to do when it is not ready. */
  hint: string;
  /** Estimated US dollars per painting. */
  cost: number;
  local?: LocalModel;
}

export function painterOf(images: ImageSettings, keys: Record<ImageProvider, boolean>, localReady: string[]): PainterInfo {
  if (images.provider === 'local') {
    const lm = localModel(images.localModel);
    return {
      label: lm?.name ?? 'Local model',
      where: 'this computer',
      ready: Boolean(lm && localReady.includes(lm.id)),
      hint: lm ? `Install ${lm.name} in Settings → Local models` : 'Choose a local model in Settings',
      cost: 0,
      local: lm,
    };
  }
  const p = PROVIDERS[images.provider];
  return { label: p.label, where: p.company, ready: keys[images.provider], hint: `Add a ${p.company} key in Settings`, cost: p.cost[images.quality] };
}

/** "claude-opus-5-5" as people say it: "Claude Opus 5.5". */
export function modelName(id: string | undefined): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id ?? '');
  return m ? `Claude ${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}` : id ? id : 'Claude';
}

/** Who made a painting, for its label: the painter and where it ran. */
export function paintedBy(ill: Pick<Illustration, 'provider' | 'model'>): string {
  if (ill.provider === 'local') return `${localModel(ill.model)?.name ?? ill.model} · on this computer`;
  const p = PROVIDERS[ill.provider as ImageProvider];
  return p ? `${p.label} · ${p.company}` : ill.provider;
}

export function usePainter(): PainterInfo {
  const images = useStudio((s) => s.images);
  const keys = useStudio((s) => s.imageKeys);
  const localReady = useStudio((s) => s.localReady);
  return useMemo(() => painterOf(images, keys, localReady), [images, keys, localReady]);
}

/** Asks the server what is installed, and keeps the list of models ready to paint with up to date. */
export async function fetchLocal(accessCode: string): Promise<LocalStatus | null> {
  try {
    const res = await fetch('/api/local', { headers: { 'x-qw-access': accessCode } });
    if (!res.ok) return null;
    const s = (await res.json()) as LocalStatus;
    useStudio.getState().setLocalReady(s.available && s.runtime.installed ? Object.keys(s.models).filter((id) => s.models[id]!.installed) : []);
    return s;
  } catch {
    return null;
  }
}

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

/* ---------- ability icons ---------- */

/** An entry's icon is kept like a painting, under "icon:" and the entry's key. */
const ICON = 'icon:';
export const iconKey = (entryKey: string) => `${ICON}${entryKey}`;
export const isIconKey = (key: string) => key.startsWith(ICON);

/** Object URLs for several stored images at once, by id (for lists and trees). */
export function useImages(ids: (string | undefined)[]): Record<string, string> {
  const [got, setGot] = useState<Record<string, string>>({});
  const want = ids.filter((x): x is string => Boolean(x)).join('|');
  useEffect(() => {
    let live = true;
    const list = want ? want.split('|') : [];
    void Promise.all(
      list.map(async (id) => {
        if (urls.has(id)) return [id, urls.get(id)!] as const;
        const b = await idbGet<Blob>(imageKey(id)).catch(() => undefined);
        if (!b) return null;
        const u = URL.createObjectURL(b);
        urls.set(id, u);
        return [id, u] as const;
      }),
    ).then((pairs) => live && setGot(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null))));
    return () => {
      live = false;
    };
  }, [want]);
  return got;
}

/** Paints icons for these entries, one after another. */
export function paintIcons(entryKeys: string[]) {
  for (const k of entryKeys) void illustrate(iconKey(k));
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
    const { provider, quality, localModel: localId } = s.images;
    const info = painterOf(s.images, s.imageKeys, s.localReady);
    if (!info.ready) throw new Error(`${info.hint} to paint with ${info.label}.`);
    const state = fold(s.project, s.manuscript);
    const icon = isIconKey(key);
    const e = state.compendium.find((x) => x.key === (icon ? key.slice(ICON.length) : key));
    if (!e) throw new Error('That entry is no longer in the compendium.');
    const extra = icon ? {} : artExtra(s.project, state, e);
    const signature = illustrationSignature(e, extra);

    const approved = s.project.illustrations?.[key]?.approved;
    // Icons match the book's other icons; paintings match the house style.
    const styleIds = icon
      ? Object.entries(s.project.illustrations ?? {}).filter(([k, v]) => isIconKey(k) && k !== key && v.approved).map(([, v]) => v.approved!).slice(-2)
      : (s.project.styleRefs ?? []).filter((id) => id !== approved);
    const refs = (
      await Promise.all([approved ? asReference(approved, 'subject') : null, ...styleIds.map((id) => asReference(id, 'style'))])
    ).filter((r): r is NonNullable<typeof r> => r !== null);
    const style = s.project.art?.paint ?? 'painted';
    // A local model only starts from the subject's approved painting (image to image); it takes no style references.
    const sent = info.local ? refs.filter((r) => r.role === 'subject') : refs;
    const notes = artPrompt(e, {
      ...extra,
      style,
      icon,
      short: info.local?.shortPrompt,
      references: info.local ? undefined : { subject: sent.some((r) => r.role === 'subject'), style: sent.filter((r) => r.role === 'style').length },
    });

    // Without the AI, the notes themselves are a usable (if plainer) prompt.
    const art: ArtDirection =
      s.aiStatus === 'on'
        ? (await post<{ result: ArtDirection }>('/api/extract', { mode: 'art', notes })).result
        : { prompt: notes.replace('Style paragraph to end with:\n', ''), caption: e.name, aspect: defaultAspect(e.category) };
    const painted = await post<{ mime: string; data: string; model: string }>('/api/illustrate', { provider, quality, prompt: art.prompt, aspect: art.aspect, refs: sent, ...(info.local ? { localModel: localId } : {}) });

    const ill: Illustration = {
      id: newId(),
      provider,
      model: painted.model,
      prompt: art.prompt,
      caption: art.caption,
      aspect: art.aspect,
      signature,
      createdAt: Date.now(),
      cost: info.cost,
      style,
      ...(opts.auto ? { auto: true } : {}),
    };
    await idbSet(imageKey(ill.id), b64ToBlob(painted.data, painted.mime));
    // An automatic repaint keeps the codex current; one asked for by hand waits for the author to approve it (unless it is the first).
    useStudio.getState().addIllustration(key, ill, opts.auto);
  });
  chain = run.catch(() => undefined);
  return run
    .catch((err: unknown) => {
      useStudio.getState().toast({ kind: 'error', head: `Could not paint ${isIconKey(key) ? 'an icon for ' : ''}${key.replace(/^(icon:)?(char|lore):/, '')}`, body: err instanceof Error ? err.message : 'Try again.' });
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
      const info = painterOf(s.images, s.imageKeys, s.localReady);
      if (!s.images.auto || !info.ready) return;
      const cost = info.cost;
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
