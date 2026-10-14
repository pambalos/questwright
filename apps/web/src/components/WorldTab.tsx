'use client';

import type { PlacedParagraph, WorldDefs } from '@questwright/engine';
import { TalentTree } from './TalentTree';

const SECTIONS: { key: Exclude<keyof WorldDefs, 'magic'>; title: string }[] = [
  { key: 'currencies', title: 'Currencies' },
  { key: 'stats', title: 'Stats' },
  { key: 'slots', title: 'Equipment slots' },
  { key: 'skills', title: 'Skills seen' },
  { key: 'blessings', title: 'Blessings' },
];

export function WorldTab({ world, flat, onJump }: { world: WorldDefs; flat: PlacedParagraph[]; onJump(pid: string): void }) {
  return (
    <>
      <p className="note">The rules of this story&apos;s system, built from what the manuscript has introduced so far. Every character shares these definitions.</p>
      <div className="codex">
        <h4>Magic systems</h4>
        {world.magic.length ? (
          world.magic.map((m) => <TalentTree key={m.name} system={m} flat={flat} onJump={onJump} />)
        ) : (
          <p className="note">None yet. A system appears when a character takes one up or learns a skill that belongs to one.</p>
        )}
      </div>
      {SECTIONS.map(({ key, title }) => (
        <div className="codex" key={key}>
          <h4>{title}</h4>
          {world[key].length ? (
            <div className="chips">{world[key].map((v) => <span className="chip" key={v}>{v}</span>)}</div>
          ) : (
            <p className="note">None yet.</p>
          )}
        </div>
      ))}
    </>
  );
}
