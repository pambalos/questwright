'use client';

import { label, type CompendiumEntry, type LoreCategory, type PlacedParagraph, type WorldState } from '@questwright/engine';
import { useMemo, useState } from 'react';
import { useStudio } from '@/lib/store';

const CATEGORIES: { key: LoreCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'character', label: 'Characters' },
  { key: 'creature', label: 'Bestiary' },
  { key: 'place', label: 'Places' },
  { key: 'faction', label: 'Factions' },
  { key: 'item', label: 'Items' },
  { key: 'other', label: 'Lore' },
];

const BADGE: Record<LoreCategory, string> = { character: 'Character', creature: 'Creature', place: 'Place', faction: 'Faction', item: 'Item', other: 'Lore' };

/** What the story has said about one subject, oldest first, each linked to its paragraph; the author can strike out a wrong one. */
export function LoreFacts({ facts, flat, onJump, limit }: { facts: CompendiumEntry['facts']; flat: PlacedParagraph[]; onJump(pid: string): void; limit?: number }) {
  const dismiss = useStudio((s) => s.dismiss);
  const [all, setAll] = useState(false);
  const shown = limit && !all ? facts.slice(0, limit) : facts;
  const where = (pid: string) => {
    const p = flat.find((x) => x.id === pid);
    return p ? label(p) : '';
  };
  if (!facts.length) return <p className="note">The story has not said anything about this yet.</p>;
  return (
    <>
      <ul className="facts">
        {shown.map((f) => (
          <li key={f.recordId}>
            <span className="fact">{f.fact}</span>
            <button className="at" title="Go to this paragraph" onClick={() => onJump(f.at)}>{where(f.at)}</button>
            <button className="strike" title="Not right: strike it out" aria-label={`Strike out: ${f.fact}`} onClick={() => dismiss(f.recordId)}>×</button>
          </li>
        ))}
      </ul>
      {limit && facts.length > limit && (
        <button className="mini" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${facts.length}`}</button>
      )}
    </>
  );
}

/** The author's own notes on an entry, saved with the book. */
export function LoreNote({ entryKey }: { entryKey: string }) {
  const note = useStudio((s) => s.project.loreNotes?.[entryKey] ?? '');
  const setNote = useStudio((s) => s.setLoreNote);
  return (
    <textarea className="lore-note" rows={2} placeholder="Your notes: plans, secrets, things the story has not revealed yet" aria-label="Your notes" value={note} onChange={(e) => setNote(entryKey, e.target.value)} />
  );
}

/** Everyone and everything the story has introduced so far: characters, creatures, places, factions, items. Follows the timeline slider. */
export function Compendium({ state, flat, onJump }: { state: WorldState; flat: PlacedParagraph[]; onJump(pid: string): void }) {
  const characters = useStudio((s) => s.project.characters);
  const setTab = useStudio((s) => s.setTab);
  const [category, setCategory] = useState<LoreCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: state.compendium.length };
    for (const e of state.compendium) c[e.category] = (c[e.category] ?? 0) + 1;
    return c;
  }, [state.compendium]);
  const q = query.trim().toLowerCase();
  const entries = state.compendium.filter(
    (e) =>
      (category === 'all' || e.category === category) &&
      (!q || e.name.toLowerCase().includes(q) || e.facts.some((f) => f.fact.toLowerCase().includes(q)) || (e.characterId && characters[e.characterId]?.aliases.some((a) => a.includes(q)))),
  );
  const where = (pid: string) => {
    const p = flat.find((x) => x.id === pid);
    return p ? label(p) : '';
  };

  return (
    <>
      <p className="note">Everyone and everything the story has introduced so far. Entries and facts are added as the AI reads; strike out anything wrong, and add your own notes.</p>
      <div className="lore-tools">
        <input className="lore-search" type="search" placeholder="Search the compendium" aria-label="Search the compendium" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips" role="group" aria-label="Show">
          {CATEGORIES.filter((c) => c.key === 'all' || counts[c.key]).map((c) => (
            <button key={c.key} className={`chip${category === c.key ? ' sel' : ''}`} aria-pressed={category === c.key} onClick={() => setCategory(c.key)}>
              {c.label} <span className="n">{counts[c.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      {!state.compendium.length && <p className="note">Nothing discovered yet. As the story introduces people, creatures, places and factions, they appear here.</p>}
      {state.compendium.length > 0 && !entries.length && <p className="note">Nothing matches.</p>}
      <div className="lore-list">
        {entries.map((e) => {
          const c = e.characterId ? characters[e.characterId] : undefined;
          const expanded = open === e.key;
          const sheet = e.characterId ? state.sheets[e.characterId] : undefined;
          return (
            <article key={e.key} className={`lore-card cat-${e.category}${expanded ? ' open' : ''}`}>
              <button className="lore-h" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : e.key)}>
                <span className="lore-name">{e.name}</span>
                <span className="lore-badge">{BADGE[e.category]}</span>
                <span className="lore-meta">{e.facts.length ? `${e.facts.length} ${e.facts.length === 1 ? 'fact' : 'facts'} · ` : ''}first seen {where(e.firstAt)}</span>
              </button>
              {!expanded && (c?.role || c?.description || e.facts[0]) && (
                <p className="lore-gist">{[c?.role, c?.description].filter(Boolean).join(' · ') || e.facts[0]?.fact}</p>
              )}
              {expanded && (
                <div className="lore-body">
                  {c && (c.role || c.description || c.aliases.length > 0) && (
                    <p className="lore-gist">
                      {[c.role, c.description].filter(Boolean).join(' · ')}
                      {c.aliases.length > 0 && <span className="sub"> Also called {c.aliases.join(', ')}.</span>}
                    </p>
                  )}
                  <LoreFacts facts={e.facts} flat={flat} onJump={onJump} />
                  <LoreNote entryKey={e.key} />
                  {sheet?.promoted && <button className="mini" onClick={() => setTab(e.characterId!)}>Open {e.name}&apos;s sheet</button>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
