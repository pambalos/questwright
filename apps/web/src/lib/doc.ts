import type { JSONContent } from '@tiptap/core';
import { isBookMarker, isChapterMarker, type Manuscript } from '@questwright/engine';

export const newPid = () => `p${Math.random().toString(36).slice(2, 10)}`;

/** Plain text of a block, with hard breaks as newlines (system boxes span lines). */
export function blockText(node: JSONContent): string {
  return (node.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : c.type === 'hardBreak' ? '\n' : blockText(c))).join('');
}

/**
 * Headings start chapters; a level-1 heading starts a book only when it reads
 * like one ("Book 2") or the document also has level-2 chapter headings under
 * it. "Chapter 9 - Marcus" is a chapter at any level, and a paragraph that is
 * only a chapter marker (pasted text) starts a chapter too. Empty headings are
 * ignored. Every paragraph with an id is a tracked paragraph.
 */
export function docToManuscript(doc: JSONContent): Manuscript {
  const chapters: Manuscript['chapters'] = [];
  let book: string | undefined;
  const headings: { level: number; text: string }[] = [];
  const collect = (nodes: JSONContent[]) => {
    for (const n of nodes) {
      if (n.type === 'heading') headings.push({ level: Number(n.attrs?.level ?? 2), text: blockText(n).trim() });
      else if (n.content && n.type !== 'paragraph') collect(n.content);
    }
  };
  collect(doc.content ?? []);
  // Level-1 headings are books only when the chapters sit under them as level 2.
  const nested = headings.some((h) => h.level >= 2 && h.text && isChapterMarker(h.text)) || headings.some((h) => h.level === 1 && isBookMarker(h.text));
  const isBook = (level: number, text: string) => level === 1 && (isBookMarker(text) || (nested && !isChapterMarker(text)));
  const start = (title: string) => chapters.push({ id: `ch${chapters.length + 1}`, title, ...(book !== undefined ? { book } : {}), paragraphs: [] });
  const current = () => {
    const last = chapters[chapters.length - 1];
    if (last && last.book === book) return last;
    start('Untitled chapter');
    return chapters[chapters.length - 1]!;
  };
  const walk = (nodes: JSONContent[]) => {
    for (const n of nodes) {
      if (n.type === 'heading') {
        const text = blockText(n).trim();
        if (!text) continue;
        if (isBook(Number(n.attrs?.level ?? 2), text)) book = text;
        else start(text);
      } else if (n.type === 'paragraph') {
        const pid = n.attrs?.pid as string | undefined;
        const text = blockText(n);
        if (isChapterMarker(text) && !text.includes('[')) start(text.trim());
        else if (pid) current().paragraphs.push({ id: pid, text });
      } else if (n.content) walk(n.content);
    }
  };
  walk(doc.content ?? []);
  return { chapters };
}

/** Builds an editor document from a manuscript, keeping paragraph ids. */
export function manuscriptToDoc(m: Manuscript): JSONContent {
  const content: JSONContent[] = [];
  let book: string | undefined;
  for (const ch of m.chapters) {
    if (ch.book !== undefined && ch.book !== book) {
      book = ch.book;
      content.push({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: ch.book }] });
    }
    content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: ch.title }] });
    for (const p of ch.paragraphs) {
      const parts = p.text.split('\n');
      const inline: JSONContent[] = [];
      parts.forEach((t, i) => {
        if (i) inline.push({ type: 'hardBreak' });
        if (t) inline.push({ type: 'text', text: t });
      });
      content.push({ type: 'paragraph', attrs: { pid: p.id }, content: inline.length ? inline : undefined });
    }
  }
  return { type: 'doc', content };
}

export const BLANK_DOC: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Chapter One' }] },
    { type: 'paragraph', attrs: { pid: 'p-first' } },
  ],
};
