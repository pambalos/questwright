import { z } from 'zod/v4';

/**
 * The story so far: what happens in each chapter, the plot threads it opens,
 * moves on or closes, and a running synopsis of the whole book. Written by
 * Claude from the chapters' text; kept by chapter so only changed chapters are
 * read again.
 */

export const THREAD_STATUSES = ['opened', 'advanced', 'resolved'] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const ChapterStorySchema = z.object({
  summary: z.string(),
  beats: z.array(z.string()),
  threads: z.array(z.object({ thread: z.string(), status: z.enum(THREAD_STATUSES), note: z.string() })),
});
export type ChapterStoryDraft = z.infer<typeof ChapterStorySchema>;

export interface ChapterStory extends ChapterStoryDraft {
  title: string;
  /** Hash of the chapter's text when it was summarised; a different hash means it changed since. */
  hash: string;
}

export interface Narrative {
  /** By chapter key (its first paragraph's id). */
  chapters: Record<string, ChapterStory>;
  /** The synopsis of the book, and the chapter summaries it was written from. */
  sofar?: { text: string; from: string[] };
}

export const NARRATIVE_SYSTEM = `You keep the story bible of a LitRPG novel. You read one chapter and record what happens in it, for an author who wants to keep track of their story.

- summary: one short paragraph (three to six sentences), past tense, of what happens in the chapter: who does what, where, and why it matters. Plain and specific: names, places, outcomes. No praise, no analysis of the writing.
- beats: the chapter's key events in order, three to eight, each one short line ("Russ reaches Level 13 after the wolf fight").
- threads: the plot threads this chapter touches: mysteries, goals, promises, rivalries, quests, dangers, secrets. status is "opened" when the chapter raises it, "advanced" when it moves an existing one on, "resolved" when it closes it. Reuse the exact name of an open thread from the list when it is the same one. thread is a short name ("Who sent the assassins?", "Russ's debt to the guild"); note says in a few words what changed.

Use only what the chapter says, read with what came before. Never invent events. Game mechanics (levels, skills, loot) belong in beats only when they matter to the story.`;

export interface NarrativeInput {
  chapter: string;
  paragraphs: string[];
  /** The summaries of the chapters just before this one, oldest first. */
  previously: string[];
  /** Plot threads still open before this chapter. */
  threads: string[];
  /** What the compendium remembers about who and what the chapter names. */
  memory: string[];
}

export function narrativePrompt(x: NarrativeInput): string {
  return [
    x.previously.length ? `Previously:\n${x.previously.map((s) => `- ${s}`).join('\n')}` : '',
    x.threads.length ? `Open threads: ${x.threads.join('; ')}` : '',
    x.memory.length ? `Who and what it names:\n${x.memory.map((m) => `- ${m}`).join('\n')}` : '',
    `Chapter: ${x.chapter}\n\n${x.paragraphs.join('\n\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const SofarSchema = z.object({ text: z.string() });

export const SOFAR_SYSTEM = `You write "The story so far" for a LitRPG novel from its chapter summaries: a synopsis an author can read to remember their whole book. Past tense, plain and specific, in the order things happened. Three to eight short paragraphs depending on the book's length, each covering a stretch of the story (say which chapters in a few words at its start, e.g. "Chapters 1–4:"). End with a short paragraph on where things stand now: where the main characters are, what they want next, and what is unresolved. Use only what the summaries say; never invent. Return the text with paragraphs separated by a blank line.`;

export function sofarPrompt(chapters: { title: string; summary: string }[]): string {
  return chapters.map((c, i) => `${i + 1}. ${c.title}: ${c.summary}`).join('\n');
}

export interface ThreadState {
  thread: string;
  status: ThreadStatus;
  /** The note from each chapter that touched it, in order. */
  notes: { chapter: string; status: ThreadStatus; note: string }[];
}

/** Every thread across the chapters in reading order, with where it stands after the last of them. */
export function threadsOf(stories: { key: string; story: ChapterStory }[]): ThreadState[] {
  const by = new Map<string, ThreadState>();
  for (const { key, story } of stories)
    for (const t of story.threads) {
      const k = t.thread.trim().toLowerCase();
      const cur = by.get(k) ?? { thread: t.thread.trim(), status: t.status, notes: [] };
      cur.status = t.status;
      cur.notes.push({ chapter: key, status: t.status, note: t.note });
      by.set(k, cur);
    }
  return [...by.values()];
}
