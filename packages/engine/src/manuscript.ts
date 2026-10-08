import type { Manuscript, Paragraph } from './types';

export interface PlacedParagraph extends Paragraph {
  index: number;
  chapterIndex: number;
  /** Position within its chapter, starting at 0. */
  number: number;
  /** Book position and the chapter's position within that book, when the manuscript has books. */
  bookIndex?: number;
  bookChapter?: number;
}

const flatCache = new WeakMap<Manuscript, PlacedParagraph[]>();

/** Every paragraph in reading order, with its global and in-chapter position. Cached per manuscript. */
export function flatten(m: Manuscript): PlacedParagraph[] {
  const hit = flatCache.get(m);
  if (hit) return hit;
  const out: PlacedParagraph[] = [];
  let bookIndex = -1;
  let bookChapter = 0;
  let lastBook: string | undefined;
  m.chapters.forEach((ch, chapterIndex) => {
    if (ch.book !== undefined && ch.book !== lastBook) {
      bookIndex++;
      bookChapter = 0;
      lastBook = ch.book;
    } else if (ch.book !== undefined) bookChapter++;
    const where = ch.book !== undefined ? { bookIndex, bookChapter } : {};
    ch.paragraphs.forEach((p, number) => out.push({ ...p, index: out.length, chapterIndex, number, ...where }));
  });
  flatCache.set(m, out);
  return out;
}

export function indexById(m: Manuscript): Map<string, PlacedParagraph> {
  return new Map(flatten(m).map((p) => [p.id, p]));
}

/** "Ch 3 ¶2" style label for a paragraph position; "Bk 2 · Ch 3 ¶2" in a series. */
export function label(p: { chapterIndex: number; number: number; bookIndex?: number; bookChapter?: number }): string {
  if (p.bookIndex !== undefined) return `Bk ${p.bookIndex + 1} · Ch ${(p.bookChapter ?? 0) + 1} ¶${p.number + 1}`;
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
