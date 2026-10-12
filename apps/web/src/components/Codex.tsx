'use client';

import { codexPrompt, label, memoryCount, type CompendiumEntry, type LoreCategory, type PlacedParagraph, type WorldState } from '@questwright/engine';
import { useEffect, useMemo, useState } from 'react';
import { Figure2D } from '@/figure/Figure2D';
import { gearFor } from '@/figure/gear';
import { lookOf } from '@/figure/look';
import { CharacterModel } from '@/figure/vrm/CharacterModel';
import { artTargets, iconKey, type ArtType } from '@/lib/illustrator';
import { ArtStatus } from './ArtStatus';
import { useStudio } from '@/lib/store';
import { LoreFacts, LoreNote } from './Compendium';
import { Painted, PaintingPanel } from './Painting';
import { IconRow } from './SkillIcon';
import { CardDeck, CardPanel } from './GameCard';

const BOOKS: { key: LoreCategory; title: string }[] = [
  { key: 'character', title: 'Characters' },
  { key: 'creature', title: 'Bestiary' },
  { key: 'place', title: 'Places' },
  { key: 'faction', title: 'Factions' },
  { key: 'item', title: 'Items' },
  { key: 'spell', title: 'Spells' },
  { key: 'magic', title: 'Magic' },
  { key: 'other', title: 'Lore' },
];

/** Engraved emblems for entries that have no figure. */
const EMBLEM: Record<LoreCategory, string> = {
  character: 'M32 14a9 9 0 110 18 9 9 0 010-18zM14 54c0-10 8-17 18-17s18 7 18 17',
  creature: 'M18 14c4 10 4 22 0 36M28 10c4 12 4 28 0 44M38 10c4 12 4 28 0 44M48 14c4 10 4 22 0 36',
  place: 'M20 54V26l12-12 12 12v28M20 34h24M28 54V42h8v12M14 54h36',
  faction: 'M20 10v46M20 12h26l-6 9 6 9H20',
  item: 'M32 8l4 30h-8zM24 38h16M32 38v12M28 52a4 4 0 108 0',
  spell: 'M32 8l6 18 18 6-18 6-6 18-6-18-18-6 18-6z',
  magic: 'M32 12a20 20 0 110 40 20 20 0 010-40zM32 22a10 10 0 110 20 10 10 0 010-20zM32 8v8M32 48v8M8 32h8M48 32h8',
  other: 'M18 12h24l6 6v34H18zM42 12v6h6M24 26h18M24 34h18M24 42h12',
};

function Emblem({ category, size = 64 }: { category: LoreCategory; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="32" cy="32" r="30" strokeOpacity=".25" />
      <path d={EMBLEM[category]} />
    </svg>
  );
}

/** Plain prose from an entry's facts, until a codex entry is written. */
function draft(e: CompendiumEntry): string[] {
  if (!e.facts.length) return [];
  const sentences = e.facts.map((f) => f.fact.trim()).map((f) => (/[.!?]$/.test(f) ? f : `${f}.`));
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += 4) out.push(sentences.slice(i, i + 4).join(' '));
  return out;
}

/** The compendium as a game codex: a book per kind of entry, a portrait, and a journal page written from memory. */
const ART_OF: Record<LoreCategory, ArtType> = { character: 'portrait', creature: 'painting', place: 'painting', faction: 'painting', other: 'painting', spell: 'ability', magic: 'ability', item: 'item' };

export function Codex({ state, flat, docked }: { state: WorldState; flat: PlacedParagraph[]; docked?: boolean }) {
  const project = useStudio((s) => s.project);
  const setDock = useStudio((s) => s.setCodexDock);
  const [artOpen, setArtOpen] = useState(false);
  // Docked, the list shows two entries, or eight expanded; it scrolls either way.
  const [listOpen, setListOpen] = useState(false);
  const [deck, setDeck] = useState(false);
  const art = useMemo(() => new Map(artTargets(project, state).map((t) => [t.entryKey, t])), [project, state]);
  const target = useStudio((s) => s.codexOpen);
  const setOpen = useStudio((s) => s.setCodexOpen);
  const jump = useStudio((s) => s.jump);
  const characters = useStudio((s) => s.project.characters);
  const protagonistId = useStudio((s) => s.project.protagonistId);
  const style = useStudio((s) => s.project.art?.style ?? 'painterly');
  const render = useStudio((s) => s.project.art?.render ?? 'anime');
  const written = useStudio((s) => s.project.codex);
  const setCodex = useStudio((s) => s.setCodex);
  const accessCode = useStudio((s) => s.accessCode);
  const aiStatus = useStudio((s) => s.aiStatus);
  const toast = useStudio((s) => s.toast);

  const books = useMemo(() => BOOKS.filter((b) => state.compendium.some((e) => e.category === b.key)), [state.compendium]);
  const start = state.compendium.find((e) => e.key === target);
  const [book, setBook] = useState<LoreCategory>(start?.category ?? books[0]?.key ?? 'character');
  const [selected, setSelected] = useState<string | null>(start?.key ?? null);
  const [query, setQuery] = useState('');
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const q = query.trim().toLowerCase();
  const entries = state.compendium.filter((e) => e.category === book && (!q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.includes(q))));
  const entry = state.compendium.find((e) => e.key === selected && e.category === book) ?? entries[0];
  const at = books.findIndex((b) => b.key === book);
  const go = (d: number) => {
    if (!books.length) return;
    const next = books[(at + d + books.length) % books.length]!;
    setBook(next.key);
    setSelected(null);
  };
  const open = (key: string) => {
    const e = state.compendium.find((x) => x.key === key);
    if (!e) return;
    setBook(e.category);
    setSelected(key);
    setQuery('');
  };
  const where = (pid: string) => {
    const p = flat.find((x) => x.id === pid);
    return p ? label(p) : '';
  };
  const memories = state.compendium.reduce((n, e) => n + memoryCount(e), 0);

  const character = entry?.characterId ? characters[entry.characterId] : undefined;
  const sheet = entry?.characterId ? state.sheets[entry.characterId] : undefined;
  const page = entry ? written?.[entry.key] : undefined;
  const fresh = entry ? memoryCount(entry) - (page?.from ?? 0) : 0;

  const write = async () => {
    if (!entry) return;
    setWriting(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-qw-access': accessCode },
        body: JSON.stringify({ mode: 'codex', notes: codexPrompt(entry, { role: character?.role, description: character?.description }) }),
      });
      const data = (await res.json().catch(() => ({}))) as { result?: { text?: string }; error?: string };
      if (!res.ok || !data.result?.text) throw new Error(data.error ?? `The server answered ${res.status}.`);
      setCodex(entry.key, data.result.text.trim(), memoryCount(entry));
    } catch (e) {
      toast({ kind: 'error', head: 'Could not write the entry', body: e instanceof Error ? e.message : 'Try again.' });
    } finally {
      setWriting(false);
    }
  };

  const thumb = (e: CompendiumEntry) => {
    const c = e.characterId ? characters[e.characterId] : undefined;
    const s = e.characterId ? state.sheets[e.characterId] : undefined;
    return <Painted entryKey={e.category === 'spell' || e.category === 'magic' || e.category === 'item' ? iconKey(e.key) : e.key} fallback={c ? <Figure2D crop look={lookOf(c, protagonistId)} features={s ? gearFor(s) : []} style={style} label="" /> : <Emblem category={e.category} size={38} />} />;
  };
  const paragraphs = page ? page.text.split(/\n\s*\n/) : entry ? draft(entry) : [];

  return (
    <div className={`codex-screen${docked ? ' docked' : ''}`} role="dialog" aria-modal={!docked} aria-label="Codex">
      <header className="cx-top">
        <div className="cx-stats">
          <span>{state.compendium.length} entries</span>
          <span>{memories} memories</span>
        </div>
        <nav className="cx-books" aria-label="Codex books">
          <button className="cx-arrow" aria-label="Previous book" onClick={() => go(-1)}>◀</button>
          <span className="cx-side">{books.length > 1 ? books[(at - 1 + books.length) % books.length]!.title : ''}</span>
          <h2>{books[at]?.title ?? 'Codex'}</h2>
          <span className="cx-side">{books.length > 1 ? books[(at + 1) % books.length]!.title : ''}</span>
          <button className="cx-arrow" aria-label="Next book" onClick={() => go(1)}>▶</button>
          <div className="cx-dots" aria-hidden="true">{books.map((b) => <i key={b.key} className={b.key === book ? 'on' : ''} />)}</div>
        </nav>
        <div className="cx-tools">
          {books[at] && ['spell', 'magic', 'item'].includes(books[at]!.key) && (
            <button className={`cx-tool${deck ? ' on' : ''}`} aria-pressed={deck} title="See this book's entries as cards" onClick={() => setDeck(!deck)}>Cards</button>
          )}
          <button className={`cx-tool${artOpen ? ' on' : ''}`} aria-pressed={artOpen} title="What has been painted, and paint the rest" onClick={() => setArtOpen(!artOpen)}>Art</button>
          <button className="cx-tool" title={docked ? 'Full screen' : 'Show the codex in the side panel'} onClick={() => setDock(docked ? 'full' : 'panel')}>{docked ? '⤢' : '◧'}</button>
          <button className="cx-close" aria-label="Close the codex" title="Close (Esc)" onClick={() => setOpen(null)}>✕</button>
        </div>
      </header>
      {artOpen && (
        <div className="cx-art">
          <ArtStatus state={state} />
        </div>
      )}

      {deck && books[at] && ['spell', 'magic', 'item'].includes(books[at]!.key) ? (
        <CardDeck entries={entries} onOpen={(k) => { setSelected(k); setDeck(false); }} />
      ) : (
      <div className="cx-body">
        <aside className="cx-list">
          <input className="cx-search" type="search" placeholder="Search" aria-label="Search this book" value={query} onChange={(e) => setQuery(e.target.value)} />
          {books[at] && <ArtStatus state={state} only={[ART_OF[books[at]!.key]]} compact />}
          <div className={`cx-items${listOpen ? ' open' : ''}`} role="listbox" aria-label={books[at]?.title}>
            {entries.map((e) => (
              <button key={e.key} role="option" aria-selected={e.key === entry?.key} className={`cx-item${e.key === entry?.key ? ' on' : ''}`} onClick={() => setSelected(e.key)}>
                <span className="cx-thumb">{thumb(e)}</span>
                <span className="cx-name">{e.name}</span>
                {written?.[e.key] && <span className="cx-quill" title="Entry written">✒</span>}
                {art.get(e.key) && <span className={`cx-art-dot ${art.get(e.key)!.status}`} title={{ current: 'Painted in the current style', other: 'Painted in an older style', missing: 'Not painted yet' }[art.get(e.key)!.status]} />}
              </button>
            ))}
            {!entries.length && <p className="cx-empty">Nothing here{q ? ' matches' : ' yet'}.</p>}
          </div>
          {docked && entries.length > 2 && (
            <button className="cx-more" aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>
              {listOpen ? 'Smaller' : 'Expand'}
            </button>
          )}
        </aside>

        <section className="cx-portrait" aria-label="Portrait">
          {entry && (
            <>
              <PaintingPanel
                key={entry.key}
                entry={entry}
                state={state}
                figure={
                  character && sheet?.promoted ? (
                    <CharacterModel character={character} look={lookOf(character, protagonistId)} features={gearFor(sheet)} style={style} render={render} highlight={null} label={`${character.name}`} />
                  ) : character ? (
                    <Figure2D look={lookOf(character, protagonistId)} features={sheet ? gearFor(sheet) : []} style={style} label={character.name} />
                  ) : (
                    <div className="cx-emblem"><Emblem category={entry.category} size={220} /></div>
                  )
                }
              />
              {(entry.category === 'spell' || entry.category === 'magic' || entry.category === 'item') && (
                <IconRow key={`icon-${entry.key}`} entryKey={entry.key} name={entry.name} label={entry.category === 'item' ? 'Item icon' : 'Ability icon'} />
              )}
              {entry.relations.length > 0 && (
                <div className="cx-links">
                  <h3>Connections</h3>
                  <div className="cx-link-row">
                    {entry.relations.slice(-8).map((r) => (
                      <button key={r.recordId + r.direction} className="cx-link" title={r.direction === 'out' ? `${entry.name} ${r.relation} ${r.name}` : `${r.name} ${r.relation} ${entry.name}`} onClick={() => open(r.key)}>
                        <span className="cx-link-name">{r.name}</span>
                        <span className="cx-link-rel">{r.direction === 'out' ? r.relation : `${r.relation} ${entry.name}`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <article className="cx-page">
          {entry ? (
            <>
              <h3 className="cx-title">{entry.name}</h3>
              {(character?.role || entry.aliases.length > 0) && (
                <p className="cx-sub">{[character?.role, entry.aliases.length ? `also called ${entry.aliases.join(', ')}` : ''].filter(Boolean).join(' · ')}</p>
              )}
              <div className="cx-prose">
                {paragraphs.length ? paragraphs.map((t, i) => <p key={i}>{t}</p>) : <p className="cx-muted">The story has not said much about this yet.</p>}
              </div>
              <div className="cx-write">
                {aiStatus === 'on' && memoryCount(entry) > 0 && (
                  <button disabled={writing} onClick={() => void write()}>
                    {writing ? 'Writing…' : page ? (fresh > 0 ? `Rewrite · ${fresh} new ${fresh === 1 ? 'memory' : 'memories'}` : 'Rewrite') : 'Write entry'}
                  </button>
                )}
                {!page && paragraphs.length > 0 && <span className="cx-muted">Drafted from the facts so far.</span>}
              </div>
              <CardPanel key={`card-${entry.key}`} entry={entry} />
              {entry.traits.length > 0 && (
                <div className="cx-section">
                  <h4>Traits</h4>
                  <div className="cx-traits">{[...new Set(entry.traits.map((t) => t.text))].map((t) => <span key={t}>{t}</span>)}</div>
                </div>
              )}
              {entry.said.length > 0 && (
                <div className="cx-section">
                  <h4>Said</h4>
                  {entry.said.map((s) => (
                    <blockquote key={s.recordId}>
                      “{s.text}”
                      <footer>{s.speaker ? `${s.speaker} · ` : ''}<button className="at" onClick={() => { jump(s.at); setOpen(null); }}>{where(s.at)}</button></footer>
                    </blockquote>
                  ))}
                </div>
              )}
              <div className="cx-section">
                <h4>Sources · first seen {where(entry.firstAt)}</h4>
                <LoreFacts facts={entry.facts} flat={flat} onJump={(pid) => { jump(pid); setOpen(null); }} limit={5} />
              </div>
              <div className="cx-section">
                <h4>Your notes</h4>
                <LoreNote entryKey={entry.key} />
              </div>
            </>
          ) : (
            <p className="cx-muted">Nothing discovered yet. Entries appear as the story introduces them.</p>
          )}
        </article>
      </div>
      )}
    </div>
  );
}
