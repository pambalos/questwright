import type { JSONContent } from '@tiptap/core';
import type { Manuscript } from '@questwright/engine';

export const newPid = () => `p${Math.random().toString(36).slice(2, 10)}`;

/** Plain text of a block, with hard breaks as newlines (system boxes span lines). */
export function blockText(node: JSONContent): string {
  return (node.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : c.type === 'hardBreak' ? '\n' : blockText(c))).join('');
}

/** Headings start chapters; every paragraph with an id is a tracked paragraph. */
export function docToManuscript(doc: JSONContent): Manuscript {
  const chapters: Manuscript['chapters'] = [];
  const current = () => {
    if (!chapters.length) chapters.push({ id: 'ch1', title: 'Untitled chapter', paragraphs: [] });
    return chapters[chapters.length - 1]!;
  };
  const walk = (nodes: JSONContent[]) => {
    for (const n of nodes) {
      if (n.type === 'heading') chapters.push({ id: `ch${chapters.length + 1}`, title: blockText(n) || 'Untitled chapter', paragraphs: [] });
      else if (n.type === 'paragraph') {
        const pid = n.attrs?.pid as string | undefined;
        if (pid) current().paragraphs.push({ id: pid, text: blockText(n) });
      } else if (n.content) walk(n.content);
    }
  };
  walk(doc.content ?? []);
  return { chapters };
}

/** Builds an editor document from a manuscript, keeping paragraph ids. */
export function manuscriptToDoc(m: Manuscript): JSONContent {
  const content: JSONContent[] = [];
  for (const ch of m.chapters) {
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
