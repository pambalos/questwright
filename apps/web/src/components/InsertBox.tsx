'use client';

import { boxExamples, boxSections, BOX_SECTION_LABEL, cardable, entryBox, flatten, fold, label, sheetBox, type BoxSection } from '@questwright/engine';
import type { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { useEffect, useMemo, useState } from 'react';
import { useStudio } from '@/lib/store';

export type BoxKind = 'sheet' | 'entry';

/** The paragraph id the editor's cursor is in, if any. */
function cursorPid(editor: Editor): string | null {
  const $from = editor.state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'paragraph') return (node.attrs.pid as string) ?? null;
  }
  return null;
}

/** Puts a box into the story as one paragraph, its lines joined by line breaks, after the block the cursor is in. */
function insertBox(editor: Editor, text: string) {
  const inline: JSONContent[] = [];
  text.split('\n').forEach((line, i) => {
    if (i) inline.push({ type: 'hardBreak' });
    if (line) inline.push({ type: 'text', text: line });
  });
  const $from = editor.state.selection.$from;
  const at = $from.depth >= 1 ? $from.after(1) : editor.state.doc.content.size;
  editor.chain().insertContentAt(at, { type: 'paragraph', content: inline }).focus().run();
}

/**
 * "From memory": a character's status screen or a skill's, spell's or item's
 * description, written from what the book has tracked up to the cursor, to
 * check, edit (or have Claude put in the book's own style) and insert.
 */
export function InsertBox({ editor, kind: initialKind, onClose }: { editor: Editor; kind: BoxKind; onClose(): void }) {
  const project = useStudio((s) => s.project);
  const manuscript = useStudio((s) => s.manuscript);
  const tab = useStudio((s) => s.tab);
  const aiStatus = useStudio((s) => s.aiStatus);
  const accessCode = useStudio((s) => s.accessCode);
  const [kind, setKind] = useState<BoxKind>(initialKind);

  const flat = useMemo(() => flatten(manuscript), [manuscript]);
  const at = useMemo(() => {
    const pid = cursorPid(editor);
    return flat.find((p) => p.id === pid) ?? flat[flat.length - 1];
  }, [editor, flat]);
  const state = useMemo(() => fold(project, manuscript, at?.index), [project, manuscript, at]);
  const name = (id: string) => project.characters[id]?.name ?? id;

  // Characters with a sheet at this point: those with tabs first.
  const sheets = useMemo(() => Object.values(state.sheets).sort((a, b) => Number(b.promoted) - Number(a.promoted) || name(a.characterId).localeCompare(name(b.characterId))), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const [who, setWho] = useState(() => (state.sheets[tab] ? tab : project.protagonistId && state.sheets[project.protagonistId] ? project.protagonistId : sheets[0]?.characterId ?? ''));
  const sheet = state.sheets[who];
  const available = useMemo(() => (sheet ? boxSections(sheet) : []), [sheet]);
  const [sections, setSections] = useState<BoxSection[]>(['status', 'stats', 'skills', 'equipment']);

  const entries = useMemo(() => state.compendium.filter(cardable), [state]);
  const [query, setQuery] = useState('');
  const [entryKey, setEntryKey] = useState(entries[0]?.key ?? '');
  const shownEntries = entries.filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase()));
  const entry = entries.find((e) => e.key === entryKey);

  const plain = useMemo(() => {
    if (kind === 'sheet') return sheet ? sheetBox(sheet, name(who), sections.filter((s) => available.includes(s))) : '';
    return entry ? entryBox(entry, project.cards?.[entry.key]) : '';
  }, [kind, sheet, who, sections, available, entry, project.cards]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState(plain);
  const [styled, setStyled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setText(plain);
    setStyled(false);
  }, [plain]);

  const examples = useMemo(() => boxExamples(flat.map((p) => p.text), kind), [flat, kind]);

  const restyle = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-qw-access': accessCode },
        body: JSON.stringify({ mode: 'restyle', box: plain, examples }),
      });
      const data = (await res.json().catch(() => ({}))) as { result?: { text: string }; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? `The server answered ${res.status}.`);
      const t = data.result.text.trim();
      setText(t.startsWith('[') ? t : `[${t}`);
      setStyled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="presentation" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dlg insert" role="dialog" aria-modal="true" aria-labelledby="ib-title">
        <h2 id="ib-title">Insert from memory</h2>
        <div className="ib-tabs" role="tablist">
          <button role="tab" aria-selected={kind === 'sheet'} className={kind === 'sheet' ? 'on' : ''} onClick={() => setKind('sheet')}>Character sheet</button>
          <button role="tab" aria-selected={kind === 'entry'} className={kind === 'entry' ? 'on' : ''} onClick={() => setKind('entry')}>Skill, spell or item</button>
        </div>
        <p className="ib-where">As the book stands at {at ? label(at) : 'the start'}. It goes in after the paragraph the cursor is in.</p>

        {kind === 'sheet' ? (
          sheets.length ? (
            <>
              <label className="stack">
                Character
                <select value={who} onChange={(e) => setWho(e.target.value)}>
                  {sheets.map((s) => (
                    <option key={s.characterId} value={s.characterId}>
                      {name(s.characterId)}{s.className ? ` · ${s.className}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ib-sections">
                {available.map((s) => (
                  <label key={s}>
                    <input type="checkbox" checked={sections.includes(s)} onChange={(e) => setSections(e.target.checked ? [...sections, s] : sections.filter((x) => x !== s))} />
                    {BOX_SECTION_LABEL[s]}
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p>No character has a sheet yet at this point in the book.</p>
          )
        ) : entries.length ? (
          <>
            <input type="search" placeholder="Find a skill, spell or item" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="ib-list" role="listbox" aria-label="Skills, spells and items">
              {shownEntries.map((e) => (
                <button key={e.key} role="option" aria-selected={e.key === entryKey} className={e.key === entryKey ? 'on' : ''} onClick={() => setEntryKey(e.key)}>
                  {e.name}
                  <small>{e.category === 'spell' ? 'skill' : e.category === 'magic' ? 'magic system' : 'item'}{project.cards?.[e.key] ? ' · card' : ''}</small>
                </button>
              ))}
              {!shownEntries.length && <span className="ib-where">Nothing by that name.</span>}
            </div>
          </>
        ) : (
          <p>The compendium has no skills, spells or items yet at this point in the book.</p>
        )}

        {plain && (
          <label className="stack">
            {styled ? 'In your book’s style (check it, then edit freely)' : 'The box (edit freely)'}
            <textarea rows={Math.min(16, Math.max(3, text.split('\n').length + 1))} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          </label>
        )}
        {error && <p className="err">{error}</p>}
        <div className="acts">
          {plain && aiStatus === 'on' && examples.length > 0 && (
            <button type="button" disabled={busy} onClick={() => (styled ? (setText(plain), setStyled(false)) : void restyle())} title={`Claude rewrites it to look like ${examples.length} of your book's own system boxes, keeping every value`}>
              {busy ? 'Restyling…' : styled ? 'Back to plain' : 'Match my book’s style'}
            </button>
          )}
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="go"
            disabled={busy || !text.trim()}
            onClick={() => {
              insertBox(editor, text.trim().startsWith('[') ? text.trim() : `[${text.trim()}`);
              onClose();
            }}
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
