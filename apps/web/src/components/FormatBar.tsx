'use client';

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import type { ReactNode } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

/** Small line icons in the style of a document editor's toolbar. */
const ICON: Record<string, ReactNode> = {
  undo: <path d="M9 7H4V2M4 7a8 8 0 1 1-1 7" />,
  redo: <path d="M15 7h5V2M20 7a8 8 0 1 0 1 7" />,
  left: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  center: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  right: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  justify: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
  bullets: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  numbers: <path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 13.5c0-1 2.8-1 2.8.5 0 1-2.8 2-2.8 3.5h3" />,
  quote: <path d="M7 7c-2 1-3 3-3 6h4v-4H5M17 7c-2 1-3 3-3 6h4v-4h-3" />,
  scene: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  clear: <path d="M6 5h11M11 5l-3 14M4 20l16-16" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={name === 'scene' ? 3.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[name]}
    </svg>
  );
}

function Btn({ on, disabled, title, onClick, children }: { on?: boolean; disabled?: boolean; title: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`fb-btn${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label={title}
      title={title}
      disabled={disabled}
      // Keep the selection in the editor while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Writing controls like a document editor's: undo, paragraph style, marks, alignment, lists, quote, scene break. */
export function FormatBar({ editor }: { editor: Editor | null }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            undo: e.can().undo(),
            redo: e.can().redo(),
            style: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : 'p',
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            strike: e.isActive('strike'),
            align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
            bullets: e.isActive('bulletList'),
            numbers: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
          }
        : null,
  });
  if (!editor || !st) return <div className="fb" />;
  const run = () => editor.chain().focus();

  return (
    <div className="fb" role="toolbar" aria-label="Formatting">
      <Btn title={`Undo (${mod}Z)`} disabled={!st.undo} onClick={() => run().undo().run()}><Icon name="undo" /></Btn>
      <Btn title={`Redo (${mod}${isMac ? '⇧Z' : 'Y'})`} disabled={!st.redo} onClick={() => run().redo().run()}><Icon name="redo" /></Btn>
      <span className="fb-sep" />
      <select
        className="fb-style"
        aria-label="Paragraph style"
        title="Paragraph style"
        value={st.style}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'p') run().setParagraph().run();
          else run().setHeading({ level: v === 'h1' ? 1 : 2 }).run();
        }}
      >
        <option value="p">Normal text</option>
        <option value="h2">Chapter heading</option>
        <option value="h1">Book or part title</option>
      </select>
      <span className="fb-sep" />
      <Btn title={`Bold (${mod}B)`} on={st.bold} onClick={() => run().toggleBold().run()}><b>B</b></Btn>
      <Btn title={`Italic (${mod}I)`} on={st.italic} onClick={() => run().toggleItalic().run()}><i style={{ fontFamily: 'Georgia, serif' }}>I</i></Btn>
      <Btn title={`Underline (${mod}U)`} on={st.underline} onClick={() => run().toggleUnderline().run()}><u>U</u></Btn>
      <Btn title={`Strikethrough (${mod}${isMac ? '⇧S' : 'Shift+S'})`} on={st.strike} onClick={() => run().toggleStrike().run()}><s>S</s></Btn>
      <span className="fb-sep" />
      {(['left', 'center', 'right', 'justify'] as const).map((a) => (
        <Btn key={a} title={`Align ${a}`} on={st.align === a} onClick={() => (a === 'left' ? run().unsetTextAlign().run() : run().setTextAlign(a).run())}><Icon name={a} /></Btn>
      ))}
      <span className="fb-sep" />
      <Btn title="Bulleted list" on={st.bullets} onClick={() => run().toggleBulletList().run()}><Icon name="bullets" /></Btn>
      <Btn title="Numbered list" on={st.numbers} onClick={() => run().toggleOrderedList().run()}><Icon name="numbers" /></Btn>
      <Btn title="Quote" on={st.quote} onClick={() => run().toggleBlockquote().run()}><Icon name="quote" /></Btn>
      <Btn title="Scene break" onClick={() => run().setHorizontalRule().run()}><Icon name="scene" /></Btn>
      <span className="fb-sep" />
      <Btn title="Clear formatting" onClick={() => run().unsetAllMarks().unsetTextAlign().run()}><Icon name="clear" /></Btn>
    </div>
  );
}
