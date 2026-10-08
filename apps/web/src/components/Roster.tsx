'use client';

import { label, type PlacedParagraph, type WorldState } from '@questwright/engine';
import { useStudio } from '@/lib/store';

export function Roster({ view, flat }: { view: WorldState; flat: PlacedParagraph[] }) {
  const characters = useStudio((s) => s.project.characters);
  const setTab = useStudio((s) => s.setTab);
  const togglePin = useStudio((s) => s.togglePin);
  const merge = useStudio((s) => s.merge);
  const sheets = Object.values(view.sheets).sort((a, b) => (a.firstSeen ?? 0) - (b.firstSeen ?? 0));
  const others = (id: string) => Object.values(characters).filter((c) => c.id !== id && !c.mergedInto);

  if (!sheets.length)
    return <p className="note">No characters yet. Name someone in the story, or write a system box such as “Welcome, Kael.”, and they will appear here.</p>;

  return (
    <>
      <p className="note">Every named character gets a calling card. A card becomes a tab the first time the story gives them a stat, skill, item or currency, or when you pin it.</p>
      <div className="roster">
        {sheets.map((s) => {
          const c = characters[s.characterId];
          if (!c) return null;
          return (
            <div className="rc" key={c.id}>
              <b>{c.name}</b>
              <small>{c.role ? `${c.role} · ` : ''}first seen {s.firstSeen !== undefined ? label(flat[s.firstSeen]!) : '—'}</small>
              {c.description && <small>{c.description}</small>}
              {!!c.aliases.length && <small>Also called: {c.aliases.join(', ')}</small>}
              <span className={`st${s.promoted ? '' : ' dim'}`}>{s.promoted ? 'Has a tab' : 'Roster only'}</span>
              <div className="row-acts">
                {s.promoted ? (
                  <button className="mini" onClick={() => setTab(c.id)}>Open tab</button>
                ) : (
                  <button className="mini" onClick={() => togglePin(c.id)}>Pin to tabs</button>
                )}
              </div>
              <label>
                <small>Same person as </small>
                <select value="" onChange={(e) => e.target.value && merge(c.id, e.target.value)} aria-label={`Merge ${c.name} into another character`}>
                  <option value="">choose…</option>
                  {others(c.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
            </div>
          );
        })}
      </div>
    </>
  );
}
