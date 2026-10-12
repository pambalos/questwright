'use client';

import { applyPattern, compilePattern, describeChange, flatten, type Change, type LearnedPattern } from '@questwright/engine';
import { useMemo, useState } from 'react';
import { newId } from '@/lib/ids';
import { useStudio } from '@/lib/store';

/** How many paragraphs of the book a pattern matches, and what it finds there. */
export function usePatternReach(p: Pick<LearnedPattern, 'regex' | 'flags' | 'produces' | 'enabled'> | null) {
  const manuscript = useStudio((s) => s.manuscript);
  return useMemo(() => {
    if (!p || !compilePattern(p)) return { paragraphs: 0, changes: 0 };
    let paragraphs = 0;
    let changes = 0;
    for (const para of flatten(manuscript)) {
      const n = applyPattern({ ...p, enabled: true } as LearnedPattern, para.text, 'x').length;
      if (n) {
        paragraphs++;
        changes += n;
      }
    }
    return { paragraphs, changes };
  }, [p, manuscript]);
}

/**
 * "Learn pattern": the author shows an example of how their book formats a
 * system message; Claude writes a rule for it, which the author checks and
 * saves. From then on the parser applies it to every paragraph.
 */
export function LearnPattern({ example: initial, context, onClose }: { example: string; context?: string; onClose(): void }) {
  const accessCode = useStudio((s) => s.accessCode);
  const aiStatus = useStudio((s) => s.aiStatus);
  const save = useStudio((s) => s.savePattern);
  const [example, setExample] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{ pattern: LearnedPattern; explanation: string; preview: Change[] } | null>(null);
  const reach = usePatternReach(draft?.pattern ?? null);
  const compiles = draft ? Boolean(compilePattern(draft.pattern)) : true;
  const preview = useMemo(() => (draft && compiles ? applyPattern(draft.pattern, example, 'the character').map((x) => x.change) : []), [draft, compiles, example]);

  const learn = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-qw-access': accessCode },
        body: JSON.stringify({ mode: 'pattern', example: example.trim(), context }),
      });
      const data = (await res.json().catch(() => ({}))) as { result?: { pattern: LearnedPattern; explanation: string; preview: Change[] }; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? `The server answered ${res.status}.`);
      setDraft({ ...data.result, pattern: { ...data.result.pattern, id: newId() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  const edit = (patch: Partial<LearnedPattern>) => draft && setDraft({ ...draft, pattern: { ...draft.pattern, ...patch } });

  return (
    <div className="modal" role="presentation" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dlg learn" role="dialog" aria-modal="true" aria-labelledby="learn-title">
        <h2 id="learn-title">Learn a pattern</h2>
        <p>Show Questwright how your book writes a kind of system message. Claude writes a rule for it; once saved, every paragraph like it is read for free, the way built-in system boxes are.</p>
        <label className="stack">
          Example
          <textarea rows={3} value={example} onChange={(e) => { setExample(e.target.value); }} spellCheck={false} />
        </label>
        {!draft && (
          <div className="acts">
            <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="go" disabled={busy || aiStatus !== 'on' || example.trim().length < 3} onClick={() => void learn()}>
              {busy ? 'Claude is reading it…' : 'Learn this pattern'}
            </button>
          </div>
        )}
        {aiStatus !== 'on' && <p className="err">Learning a pattern needs AI reading, which is off.</p>}
        {error && <p className="err">{error}</p>}
        {draft && (
          <>
            <label className="stack">
              Name
              <input value={draft.pattern.name} onChange={(e) => edit({ name: e.target.value })} />
            </label>
            <p className="learn-why">{draft.explanation}</p>
            <label className="stack">
              Rule (regular expression)
              <input className="mono" value={draft.pattern.regex} onChange={(e) => edit({ regex: e.target.value })} spellCheck={false} />
            </label>
            {!compiles && <p className="err">That rule does not work as written.</p>}
            <div className="learn-found">
              <b>In the example it finds</b>
              {preview.length ? (
                <ul>{preview.map((c, i) => <li key={i}>{describeChange(c)}</li>)}</ul>
              ) : (
                <p className="err">Nothing. Change the rule, or ask again.</p>
              )}
              <small>
                It matches {reach.paragraphs.toLocaleString()} {reach.paragraphs === 1 ? 'paragraph' : 'paragraphs'} in this book ({reach.changes.toLocaleString()} {reach.changes === 1 ? 'find' : 'finds'}).
              </small>
            </div>
            <div className="acts">
              <button type="button" onClick={() => setDraft(null)}>Ask again</button>
              <button type="button" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="go"
                disabled={!compiles || !preview.length}
                onClick={() => {
                  save({ ...draft.pattern, example: example.trim() });
                  onClose();
                }}
              >
                Save and apply to the book
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Settings: the patterns this book has learned, to switch off, check or remove. */
export function PatternList() {
  const patterns = useStudio((s) => s.project.patterns);
  if (!patterns?.length)
    return <p className="note">None yet. Select a system message in the editor and choose Learn pattern to teach Questwright a format the built-in rules miss.</p>;
  return (
    <div className="pattern-list">
      {patterns.map((p) => <PatternRow key={p.id} p={p} />)}
    </div>
  );
}

function PatternRow({ p }: { p: LearnedPattern }) {
  const update = useStudio((s) => s.updatePattern);
  const remove = useStudio((s) => s.deletePattern);
  const reach = usePatternReach(p);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={`pattern-row${p.enabled ? '' : ' off'}`}>
      <div className="pr-main">
        <label className="pr-on" title={p.enabled ? 'In use' : 'Switched off'}>
          <input type="checkbox" checked={p.enabled} onChange={(e) => update(p.id, { enabled: e.target.checked })} />
        </label>
        <button className="pr-name" onClick={() => setOpen(!open)} aria-expanded={open}>
          <b>{p.name}</b>
          <small>
            {reach.paragraphs} {reach.paragraphs === 1 ? 'paragraph' : 'paragraphs'} · {p.produces.map((o) => o.kind).join(', ')}
          </small>
        </button>
        {confirm ? (
          <span className="lm-confirm">Remove? <button className="mini" onClick={() => remove(p.id)}>Remove</button><button className="mini" onClick={() => setConfirm(false)}>Keep</button></span>
        ) : (
          <button className="mini" onClick={() => setConfirm(true)}>Remove</button>
        )}
      </div>
      {open && (
        <div className="pr-detail">
          <code>{p.regex}</code>
          <small>Learned from: {p.example}</small>
        </div>
      )}
    </div>
  );
}
