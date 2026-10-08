import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { newPid } from './doc';

/** Gives every paragraph a stable id so changes can be tied to it. */
export const ParagraphIds = Extension.create({
  name: 'paragraphIds',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          pid: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-pid'),
            renderHTML: (attrs: Record<string, unknown>) => (attrs.pid ? { 'data-pid': attrs.pid } : {}),
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('paragraphIds'),
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((t) => t.docChanged)) return null;
          const seen = new Set<string>();
          let tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'paragraph') return true;
            const id = node.attrs.pid as string | null;
            if (!id || seen.has(id)) {
              const fresh = newPid();
              tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, pid: fresh });
              seen.add(fresh);
              changed = true;
            } else seen.add(id);
            return false;
          });
          return changed ? tr.setMeta('addToHistory', false) : null;
        },
      }),
    ];
  },
});

export interface ParagraphFlags {
  classes: string[];
  /** Exact spans to underline, taken from the changes read from this paragraph. */
  quotes: string[];
}

export const flagsKey = new PluginKey<Record<string, ParagraphFlags>>('paragraphFlags');

/** Maps an offset in the paragraph's text (hard breaks as "\n") to a document position. */
function offsetToPos(node: PMNode, start: number, offset: number): number {
  let seen = 0;
  let pos = start + 1;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    const len = child.isText ? child.text!.length : 1;
    if (offset <= seen + len) return pos + (offset - seen);
    seen += len;
    pos += child.nodeSize;
  }
  return pos;
}

function paragraphText(node: PMNode): string {
  let s = '';
  node.forEach((c) => (s += c.isText ? c.text : c.type.name === 'hardBreak' ? '\n' : ''));
  return s;
}

/** Paints system boxes, pending finds, warnings and quoted spans without touching the document. */
export const ParagraphFlagsExt = Extension.create({
  name: 'paragraphFlags',
  addProseMirrorPlugins() {
    return [
      new Plugin<Record<string, ParagraphFlags>>({
        key: flagsKey,
        state: {
          init: () => ({}),
          apply: (tr, value) => (tr.getMeta(flagsKey) as Record<string, ParagraphFlags> | undefined) ?? value,
        },
        props: {
          decorations(state) {
            const flags = flagsKey.getState(state) ?? {};
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'paragraph') return true;
              const text = paragraphText(node);
              const f = flags[node.attrs.pid as string];
              const classes = [...(text.trimStart().startsWith('[') ? ['sys'] : []), ...(f?.classes ?? [])];
              if (classes.length) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: classes.join(' ') }));
              for (const q of f?.quotes ?? []) {
                const at = q ? text.indexOf(q) : -1;
                if (at >= 0) decos.push(Decoration.inline(offsetToPos(node, pos, at), offsetToPos(node, pos, at + q.length), { class: 'hl' }));
              }
              return false;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
