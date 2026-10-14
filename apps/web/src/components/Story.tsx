'use client';

import { describeChange, threadsOf, type Change, type PlacedParagraph, type WorldState } from '@questwright/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { storyChapters, writeSofar, writeStory } from '@/lib/narrative';
import { useStudio } from '@/lib/store';

const SHOWN_EVENTS = 6;

/** What the game side of a chapter did, in a few short lines: levels, classes, skills, titles, gear and loot. */
function chapterEvents(changes: Change[], name: (id: string) => string): string[] {
  const out: string[] = [];
  const loot = new Map<string, number>();
  for (const c of changes) {
    if (c.kind === 'stat' && /^level$/i.test(c.stat) && c.set !== undefined) out.push(`${name(c.character)} reaches Level ${c.set}`);
    else if (c.kind === 'item' && c.delta > 0 && c.set === undefined) loot.set(c.character, (loot.get(c.character) ?? 0) + c.delta);
    else if (c.kind === 'class' || c.kind === 'title' || c.kind === 'skill' || c.kind === 'magic' || c.kind === 'blessing' || c.kind === 'equip')
      out.push(`${name(c.character)} · ${describeChange(c, name)}`);
  }
  for (const [who, n] of loot) out.push(`${name(who)} picks up ${n} ${n === 1 ? 'item' : 'items'}`);
  return [...new Set(out)];
}

/**
 * The narrative page: the story so far, the plot threads still open, and each
 * chapter's summary, key beats and game events. Summaries and the synopsis are
 * written by Claude; the events come straight from what the book tracked.
 * Chapters past the point being viewed are dimmed.
 */
export function Story({ latest, flat, viewIndex, onJump }: { latest: WorldState; flat: PlacedParagraph[]; viewIndex: number; onJump(pid: string): void }) {
  const project = useStudio((s) => s.project);
  const manuscript = useStudio((s) => s.manuscript);
  const aiStatus = useStudio((s) => s.aiStatus);
  const pass = useStudio((s) => s.storyPass);
  const setPass = useStudio((s) => s.setStoryPass);
  const toast = useStudio((s) => s.toast);
  const [sofarBusy, setSofarBusy] = useState(false);
  const [openEvents, setOpenEvents] = useState<string[]>([]);
  const here = useRef<HTMLLIElement>(null);

  // Recomputed when the book or its summaries change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chapters = useMemo(() => storyChapters(), [manuscript, project.narrative]);
  const name = (id: string) => project.characters[id]?.name ?? id;
  const viewChapter = flat[viewIndex]?.chapterIndex ?? 0;
  const chapterIndex = useMemo(() => new Map(manuscript.chapters.map((c, i) => [c.id, i])), [manuscript]);

  const events = useMemo(() => {
    const at = new Map<string, string>();
    for (const c of chapters) for (const p of c.paras) at.set(p.id, c.key);
    const by = new Map<string, Change[]>();
    for (const r of project.records) {
      const key = r.status === 'applied' ? at.get(r.paragraphId) : undefined;
      if (key) (by.get(key) ?? by.set(key, []).get(key)!).push(r.change);
    }
    const met = new Map<string, string[]>();
    for (const e of latest.compendium) {
      const key = e.category === 'character' ? at.get(e.firstAt) : undefined;
      if (key) (met.get(key) ?? met.set(key, []).get(key)!).push(e.name);
    }
    return { by, met };
  }, [chapters, project.records, latest.compendium]);

  const done = chapters.filter((c) => c.story);
  const stale = chapters.filter((c) => !c.current);
  const threads = useMemo(() => threadsOf(done.map((c) => ({ key: c.key, story: c.story! }))), [done]);
  const open = threads.filter((t) => t.status !== 'resolved');
  const titleOf = new Map(chapters.map((c) => [c.key, c.ch.title]));
  const sofar = project.narrative?.sofar;
  const sofarNow = done.map((c) => `${c.key}:${c.story!.hash}`);
  const sofarBehind = sofar ? sofarNow.filter((x) => !sofar.from.includes(x)).length : 0;
  const running = Boolean(pass && !pass.cancelled && !pass.error && pass.done < pass.total);

  useEffect(() => {
    here.current?.scrollIntoView({ block: 'nearest' });
    // Only when the page opens.
  }, []);

  const synopsis = async () => {
    setSofarBusy(true);
    try {
      await writeSofar();
    } catch (e) {
      toast({ kind: 'error', head: 'Could not write the story so far', body: e instanceof Error ? e.message : 'Try again.' });
    } finally {
      setSofarBusy(false);
    }
  };

  return (
    <div className="story">
      <div className="st-bar">
        <span>{done.length} of {chapters.length} chapters summarised</span>
        {aiStatus === 'on' && !running && stale.length > 0 && (
          <button className="st-go" onClick={() => void writeStory()}>
            Summarise {stale.length} {stale.length === 1 ? 'chapter' : 'chapters'}
          </button>
        )}
        {running && (
          <span className="st-run">
            Reading {pass!.chapter ?? '…'} ({pass!.done + 1} of {pass!.total})
            <button className="mini" onClick={() => setPass({ ...pass!, cancelled: true })}>Stop</button>
          </span>
        )}
        {pass?.error && (
          <span className="err">
            {pass.error} <button className="mini" onClick={() => setPass(null)}>OK</button>
          </span>
        )}
        {aiStatus !== 'on' && <span className="st-muted">Summaries need AI reading, which is off. Game events still show.</span>}
      </div>

      <section className="st-sofar">
        <div className="st-h">
          <h3>The story so far</h3>
          {aiStatus === 'on' && done.length > 0 && (
            <button className="mini" disabled={sofarBusy || running} onClick={() => void synopsis()}>
              {sofarBusy ? 'Writing…' : sofar ? (sofarBehind ? `Update · ${sofarBehind} new` : 'Rewrite') : 'Write it'}
            </button>
          )}
        </div>
        {sofar ? (
          sofar.text.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <p className="st-muted">{done.length ? 'A synopsis of the whole book, written from the chapter summaries.' : 'Summarise chapters first; the synopsis is written from them.'}</p>
        )}
      </section>

      {threads.length > 0 && (
        <section className="st-threads">
          <h3>Open threads <span className="n">{open.length}</span></h3>
          {open.length ? (
            <ul>
              {open.map((t) => (
                <li key={t.thread} title={t.notes.map((n) => `${titleOf.get(n.chapter) ?? ''}: ${n.note}`).join('\n')}>
                  <b>{t.thread}</b>
                  <small>
                    since {titleOf.get(t.notes[0]!.chapter)} · {t.notes[t.notes.length - 1]!.note}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="st-muted">Every thread so far is resolved.</p>
          )}
          {threads.length > open.length && <small className="st-muted">{threads.length - open.length} resolved</small>}
        </section>
      )}

      <ol className="st-chapters">
        {chapters.map((c, n) => {
          const idx = chapterIndex.get(c.ch.id) ?? n;
          const ev = chapterEvents(events.by.get(c.key) ?? [], name);
          const met = events.met.get(c.key) ?? [];
          const all = openEvents.includes(c.key);
          const isHere = idx === viewChapter;
          return (
            <li key={c.key} ref={isHere ? here : undefined} className={`st-ch${idx > viewChapter ? ' ahead' : ''}${isHere ? ' here' : ''}`}>
              <div className="st-h">
                <button className="st-title" onClick={() => onJump(c.paras[0]!.id)} title="Go to this chapter">
                  <small>{n + 1}</small> {c.ch.title}
                </button>
                {c.story && !c.current && <span className="st-stale" title="The chapter changed since it was summarised">changed</span>}
                {aiStatus === 'on' && !running && (
                  <button className="mini" onClick={() => void writeStory([c.key])}>{c.story ? 'Rewrite' : 'Summarise'}</button>
                )}
              </div>
              {c.story ? (
                <>
                  <p className="st-sum">{c.story.summary}</p>
                  {c.story.beats.length > 0 && (
                    <ul className="st-beats">
                      {c.story.beats.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  )}
                  {c.story.threads.length > 0 && (
                    <div className="st-tags">
                      {c.story.threads.map((t, i) => (
                        <span key={i} className={`st-tag ${t.status}`} title={t.note}>
                          {t.status === 'opened' ? '＋' : t.status === 'resolved' ? '✓' : '→'} {t.thread}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="st-muted st-sum">Not summarised yet.</p>
              )}
              {(met.length > 0 || ev.length > 0) && (
                <div className="st-events">
                  {met.length > 0 && <span className="st-met">First seen: {met.join(', ')}</span>}
                  {(all ? ev : ev.slice(0, SHOWN_EVENTS)).map((e) => <span key={e}>{e}</span>)}
                  {ev.length > SHOWN_EVENTS && (
                    <button className="st-more" onClick={() => setOpenEvents(all ? openEvents.filter((k) => k !== c.key) : [...openEvents, c.key])}>
                      {all ? 'Fewer' : `+${ev.length - SHOWN_EVENTS} more`}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
