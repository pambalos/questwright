import type { Manuscript, Paragraph } from './types';

export interface PlacedParagraph extends Paragraph {
  index: number;
  chapterIndex: number;
  /** Position within its chapter, starting at 0. */
  number: number;
}

/** Every paragraph in reading order, with its global and in-chapter position. */
export function flatten(m: Manuscript): PlacedParagraph[] {
  const out: PlacedParagraph[] = [];
  m.chapters.forEach((ch, chapterIndex) =>
    ch.paragraphs.forEach((p, number) => out.push({ ...p, index: out.length, chapterIndex, number })),
  );
  return out;
}

export function indexById(m: Manuscript): Map<string, PlacedParagraph> {
  return new Map(flatten(m).map((p) => [p.id, p]));
}

/** "Ch 3 ¶2" style label for a paragraph position. */
export function label(p: { chapterIndex: number; number: number }): string {
  return `Ch ${p.chapterIndex + 1} ¶${p.number + 1}`;
}

/** Small, stable, non-cryptographic hash (FNV-1a) used to notice edited paragraphs. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function wordCount(m: Manuscript): number {
  return flatten(m).reduce((n, p) => n + (p.text.match(/\S+/g)?.length ?? 0), 0);
}

/** A paragraph made only of bracketed system messages, the genre's "blue boxes". */
export function isSystemBox(text: string): boolean {
  return text.trimStart().startsWith('[');
}
