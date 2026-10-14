'use client';

import { fold, memoryFor, threadsOf, type ChapterStory, type ChapterStoryDraft } from '@questwright/engine';
import { loreChapters } from './lorepass';
import { useStudio } from './store';

/** Chapters with their text and key, and whether their summary is current. */
export function storyChapters() {
  const stories = useStudio.getState().project.narrative?.chapters ?? {};
  return loreChapters().map((c) => ({ ...c, story: stories[c.key], current: stories[c.key]?.hash === c.hash }));
}

const post = async <T,>(body: unknown): Promise<T> => {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-qw-access': useStudio.getState().accessCode },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || !data.result) throw new Error(data.error ?? `The server answered ${res.status}.`);
  return data.result;
};

/**
 * Has Claude summarise chapters, in reading order, one at a time: each is
 * read with the summaries just before it and the threads still open. `keys`
 * picks chapters; otherwise every chapter that is new or changed.
 */
export async function writeStory(keys?: string[]): Promise<void> {
  const st = useStudio.getState();
  if (st.storyPass && !st.storyPass.cancelled && !st.storyPass.error && st.storyPass.done < st.storyPass.total) return;
  const all = storyChapters();
  const todo = all.filter((c) => (keys ? keys.includes(c.key) : !c.current));
  if (!todo.length) return;
  st.setStoryPass({ total: todo.length, done: 0, added: 0 });
  for (const [i, c] of todo.entries()) {
    if (useStudio.getState().storyPass?.cancelled) return;
    useStudio.getState().setStoryPass({ ...useStudio.getState().storyPass!, chapter: c.ch.title, done: i });
    try {
      const s = useStudio.getState();
      const stories = s.project.narrative?.chapters ?? {};
      const before = all.slice(0, all.findIndex((x) => x.key === c.key)).filter((x) => stories[x.key]);
      const open = threadsOf(before.map((x) => ({ key: x.key, story: stories[x.key]! }))).filter((t) => t.status !== 'resolved');
      const texts = c.paras.map((p) => p.text);
      const draft = await post<ChapterStoryDraft>({
        mode: 'story',
        chapter: c.ch.title.slice(0, 200),
        paragraphs: texts.map((t) => t.slice(0, 12000)).slice(0, 1500),
        previously: before.slice(-3).map((x) => `${x.ch.title}: ${stories[x.key]!.summary}`.slice(0, 3000)),
        threads: open.slice(-60).map((t) => t.thread.slice(0, 200)),
        memory: memoryFor(fold(s.project, s.manuscript), texts, 25),
      });
      const story: ChapterStory = { ...draft, title: c.ch.title, hash: c.hash };
      useStudio.getState().setChapterStory(c.key, story);
      useStudio.getState().setStoryPass({ ...useStudio.getState().storyPass!, added: i + 1 });
    } catch (e) {
      useStudio.getState().setStoryPass({ ...useStudio.getState().storyPass!, error: e instanceof Error ? e.message : 'Summarising stopped.' });
      return;
    }
  }
  const s = useStudio.getState();
  s.setStoryPass({ ...s.storyPass!, done: todo.length, chapter: undefined });
}

/** Has Claude write the synopsis of the book from its chapter summaries. */
export async function writeSofar(): Promise<void> {
  const chapters = storyChapters().filter((c) => c.story);
  if (!chapters.length) return;
  const result = await post<{ text: string }>({
    mode: 'sofar',
    chapters: chapters.map((c) => ({ title: c.ch.title.slice(0, 200), summary: c.story!.summary.slice(0, 3000) })),
  });
  useStudio.getState().setSofar({ text: result.text.trim(), from: chapters.map((c) => `${c.key}:${c.story!.hash}`) });
}
