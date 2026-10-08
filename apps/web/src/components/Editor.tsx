'use client';

import type { WorldState } from '@questwright/engine';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef } from 'react';
import { ParagraphFlagsExt, ParagraphIds, flagsKey, type ParagraphFlags } from '@/lib/editor-extensions';
import { useStudio } from '@/lib/store';

const SAVE_DELAY_MS = 400;

export function Editor({ latest, viewPid }: { latest: WorldState; viewPid: string | null }) {
  const doc = useStudio((s) => s.doc);
  const docVersion = useStudio((s) => s.docVersion);
  const setDoc = useStudio((s) => s.setDoc);
  const setCursor = useStudio((s) => s.setCursor);
  const records = useStudio((s) => s.project.records);
  const inFlight = useStudio((s) => s.inFlight);
  const jumpTo = useStudio((s) => s.jumpTo);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [StarterKit.configure({ heading: { levels: [1, 2] } }), ParagraphIds, ParagraphFlagsExt],
      content: doc,
      editorProps: { attributes: { spellcheck: 'true', 'aria-label': 'Manuscript' } },
      onUpdate: ({ editor: ed }) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDoc(ed.getJSON()), SAVE_DELAY_MS);
      },
      onSelectionUpdate: ({ editor: ed }) => {
        const $from = ed.state.selection.$from;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'paragraph') return setCursor((node.attrs.pid as string) ?? null);
        }
      },
    },
    [docVersion],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const flags = useMemo(() => {
    const out: Record<string, ParagraphFlags> = {};
    const get = (pid: string) => (out[pid] ??= { classes: [], quotes: [] });
    for (const r of records) {
      if (r.source === 'ai' && r.status !== 'dismissed' && r.quote) get(r.paragraphId).quotes.push(r.quote);
      if (r.status === 'proposed' && !get(r.paragraphId).classes.includes('pending')) get(r.paragraphId).classes.push('pending');
    }
    for (const w of latest.warnings) {
      const f = get(w.paragraphId);
      f.classes = [...f.classes.filter((c) => c !== 'pending'), 'warn'];
    }
    for (const pid of inFlight) get(pid).classes.push('reading');
    if (viewPid) get(viewPid).classes.push('view');
    return out;
  }, [records, latest.warnings, inFlight, viewPid]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(flagsKey, flags).setMeta('addToHistory', false));
  }, [editor, flags]);

  useEffect(() => {
    if (!jumpTo || !editor) return;
    const el = editor.view.dom.querySelector(`[data-pid="${CSS.escape(jumpTo)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    useStudio.setState({ jumpTo: null });
  }, [jumpTo, editor]);

  return (
    <section className="editor" aria-label="Manuscript">
      <div className="ed-bar">
        <button className="btn" disabled={!editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>Chapter heading</button>
        <button
          className="btn"
          disabled={!editor}
          onClick={() => editor?.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: '[' }] }).run()}
        >
          System box
        </button>
        <span className="hint">Bracketed lines are system boxes. Shift+Enter for a new line inside one.</span>
      </div>
      <div className="page">
        <EditorContent editor={editor} />
      </div>
    </section>
  );
}
