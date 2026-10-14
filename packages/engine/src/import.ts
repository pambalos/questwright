import type { Chapter, Manuscript } from './types';

/**
 * A line that starts a chapter: "Chapter 3", "CHAPTER THREE: The Swamp", "Ch 17- The Hydra", "Prologue",
 * "Side Story: …", "~ Chapter 4 ~", or a markdown heading. Decorative marks around it are allowed.
 */
const CHAPTER_LINE =
  /^[\s~*=—–\-_#.]*(?:#{1,3}\s+.+|(?:chapter\b|chap\.|ch\.?(?=\s*\d))\s*[\w-]+\b.*|(?:prologue|epilogue|interlude|afterword|foreword|preface|side story|bonus chapter|extra chapter)\b.*)$/i;

/** Whether a short line reads as a chapter marker rather than prose. */
export function isChapterMarker(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length < 120 && !/[.!?]["”']?$/.test(t.replace(/\s*[~*=—–\-_]+$/, '')) && CHAPTER_LINE.test(t);
}

/** A line that starts a new book in a series: "Book 2", "Volume III: …". */
export function isBookMarker(line: string): boolean {
  const t = line.trim();
  return t.length < 120 && /^[\s~*=—–\-_#]*(?:book|volume|vol\.)\s+[\w-]+\b/i.test(t);
}

/**
 * Splits a book's plain text into chapters and paragraphs. Chapters start at
 * "Chapter 3", "Prologue" or markdown heading lines. Paragraphs are separated by
 * blank lines; when a book has none, every line is a paragraph. Consecutive
 * bracketed lines stay together as one system box.
 */
export function splitBook(text: string, book: string, idPrefix: string): Chapter[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n');
  const blankSeparated = lines.some((l, i) => l.trim() === '' && i > 0 && lines[i - 1]!.trim() !== '');
  const chapters: Chapter[] = [];
  let paras: string[] = [];
  let buf: string[] = [];
  let title = 'Opening';
  const flushPara = () => {
    // System boxes keep their line breaks; wrapped prose lines join into one paragraph.
    const joiner = buf[0]?.startsWith('[') || !blankSeparated ? '\n' : ' ';
    const t = buf.join(joiner).replace(/[ \t]+/g, ' ').trim();
    if (t) paras.push(t);
    buf = [];
  };
  const flushChapter = () => {
    flushPara();
    if (paras.length) {
      const ci = chapters.length;
      chapters.push({ id: `${idPrefix}c${ci}`, title, book, paragraphs: paras.map((t, pi) => ({ id: `${idPrefix}c${ci}p${pi}`, text: t })) });
    }
    paras = [];
  };
  // In books without blank lines, an unbracketed line that reads like system text stays with the box above it.
  const boxContinuation = /^(\+\d|[-–]\d|welcome,|you have|class\b|level\b|[A-Z][\w'-]* ·|\w+ \d+ ·)/i;
  for (const raw of lines) {
    const line = raw.trim();
    if (isChapterMarker(line)) {
      flushChapter();
      title = line.replace(/^#+\s*/, '');
      continue;
    }
    if (!line) {
      flushPara();
      continue;
    }
    if (blankSeparated) {
      // A block of lines between blank lines is one paragraph; a block that opens with a bracket is a system box.
      buf.push(line);
      continue;
    }
    const inBox = buf.length > 0 && buf[0]!.startsWith('[');
    if (inBox && (line.startsWith('[') || boxContinuation.test(line))) {
      buf.push(line);
      continue;
    }
    flushPara();
    buf.push(line);
    if (!line.startsWith('[')) flushPara();
  }
  flushChapter();
  return chapters;
}

/** Orders book files by the numbers in their names ("Book 2" before "Book 10"). */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function joinManuscripts(...parts: Manuscript[]): Manuscript {
  return { chapters: parts.flatMap((m) => m.chapters) };
}
