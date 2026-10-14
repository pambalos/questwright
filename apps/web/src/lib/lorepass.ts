'use client';

import { fold, hashText, lorePassStretches, memoryFor, type LorePass } from '@questwright/engine';
import { useStudio } from './store';

/** A find without its paragraph number, which has served its purpose. */
function withoutN<T extends { n: number }>(x: T): Omit<T, 'n'> {
  const out: Partial<T> = { ...x };
  delete out.n;
  return out as Omit<T, 'n'>;
}

/** Chapters with their text, keyed by first paragraph, and whether the lore pass has read them as they are now. */
export function loreChapters() {
  const s = useStudio.getState();
  return s.manuscript.chapters
    .map((ch) => {
      const paras = ch.paragraphs.filter((p) => p.text.trim().length > 0);
      const key = paras[0]?.id ?? ch.id;
      const hash = hashText(paras.map((p) => p.text).join('\n'));
      return { ch, paras, key, hash, read: s.project.loreRead?.[key] === hash };
    })
    .filter((c) => c.paras.length > 0);
}

/** Requests a lore pass would make: one per chapter, more for very long ones. */
export function lorePassRequests(all: boolean): number {
  return loreChapters()
    .filter((c) => all || !c.read)
    .reduce((n, c) => n + lorePassStretches(c.paras.map((p) => p.text)).length, 0);
}

/**
 * Reads chapters for the compendium, one request at a time, adding what each
 * finds as it comes back. With `all`, chapters already read are read again;
 * otherwise only new or changed ones.
 */
export async function runLorePass(all = false): Promise<void> {
  const st = useStudio.getState();
  if (st.lorePass && !st.lorePass.cancelled && !st.lorePass.error && st.lorePass.done < st.lorePass.total) return;
  const todo = loreChapters().filter((c) => all || !c.read);
  if (!todo.length) return;
  st.setLorePass({ total: todo.length, done: 0, added: 0 });
  let added = 0;
  for (const [i, c] of todo.entries()) {
    if (useStudio.getState().lorePass?.cancelled) return;
    useStudio.getState().setLorePass({ ...useStudio.getState().lorePass!, chapter: c.ch.title, done: i });
    try {
      for (const stretch of lorePassStretches(c.paras.map((p) => p.text))) {
        if (useStudio.getState().lorePass?.cancelled) return;
        const s = useStudio.getState();
        const paras = stretch.map((j) => c.paras[j]!);
        const state = fold(s.project, s.manuscript);
        const texts = paras.map((p) => p.text);
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-qw-access': s.accessCode },
          body: JSON.stringify({
            mode: 'lore',
            chapter: c.ch.title.slice(0, 200),
            paragraphs: texts.map((t) => t.slice(0, 12000)),
            compendium: [...new Set(state.compendium.map((e) => e.name.slice(0, 200)))].slice(0, 2000),
            memory: memoryFor(state, texts, 40),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { result?: LorePass; error?: string };
        if (!res.ok || !data.result) throw new Error(data.error ?? `The server answered ${res.status}.`);
        // Each find goes to the paragraph it came from.
        const by = new Map<number, { lore: LorePass['lore']; relations: LorePass['relations'] }>();
        const at = (n: number) => Math.min(paras.length, Math.max(1, Math.round(n))) - 1;
        for (const l of data.result.lore) (by.get(at(l.n)) ?? by.set(at(l.n), { lore: [], relations: [] }).get(at(l.n))!).lore.push(l);
        for (const r of data.result.relations) (by.get(at(r.n)) ?? by.set(at(r.n), { lore: [], relations: [] }).get(at(r.n))!).relations.push(r);
        added += useStudio.getState().addLore(
          [...by].map(([j, finds]) => ({ pid: paras[j]!.id, text: paras[j]!.text, finds: { lore: finds.lore.map(withoutN), relations: finds.relations.map(withoutN) } })),
        );
        useStudio.getState().setLorePass({ ...useStudio.getState().lorePass!, added });
      }
      useStudio.getState().markLoreRead(c.key, c.hash);
    } catch (e) {
      useStudio.getState().setLorePass({ ...useStudio.getState().lorePass!, error: e instanceof Error ? e.message : 'The lore pass stopped.' });
      return;
    }
  }
  const s = useStudio.getState();
  s.setLorePass({ ...s.lorePass!, done: todo.length, chapter: undefined });
  s.toast({ kind: 'ach', head: 'Lore pass', body: `Read ${todo.length} ${todo.length === 1 ? 'chapter' : 'chapters'}: ${added} new ${added === 1 ? 'memory' : 'memories'} in the compendium.` });
}
