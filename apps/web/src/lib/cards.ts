'use client';

import { cardFromDraft, cardPrompt, fold, memoryCount, type CardDraft } from '@questwright/engine';
import { useStudio } from './store';

let chain: Promise<unknown> = Promise.resolve();

/** Has Claude write (or rewrite) the cards for these entries, one after another. */
export function writeCards(keys: string[]): Promise<void> {
  const st = useStudio.getState();
  const todo = keys.filter((k) => !st.writingCards.includes(k));
  if (!todo.length) return Promise.resolve();
  st.setWritingCards([...st.writingCards, ...todo]);
  const done = (k: string) => {
    const s = useStudio.getState();
    s.setWritingCards(s.writingCards.filter((x) => x !== k));
  };
  const runs = todo.map((key) => {
    const run = chain.then(async () => {
      const s = useStudio.getState();
      const e = fold(s.project, s.manuscript).compendium.find((x) => x.key === key);
      if (!e) throw new Error('That entry is no longer in the compendium.');
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-qw-access': s.accessCode },
        body: JSON.stringify({ mode: 'card', notes: cardPrompt(e) }),
      });
      const data = (await res.json().catch(() => ({}))) as { result?: CardDraft; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? `The server answered ${res.status}.`);
      useStudio.getState().setCard(key, cardFromDraft(data.result, memoryCount(e)));
    });
    chain = run.catch(() => undefined);
    return run
      .catch((err: unknown) => useStudio.getState().toast({ kind: 'error', head: 'Could not write a card', body: err instanceof Error ? err.message : 'Try again.' }))
      .finally(() => done(key));
  });
  return Promise.all(runs).then(() => undefined);
}

/** Saves a card's element as a PNG. */
export async function saveCardImage(el: HTMLElement, name: string) {
  const { toPng } = await import('html-to-image');
  const url = await toPng(el, { pixelRatio: 3, cacheBust: true });
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}-card.png`;
  a.click();
}
