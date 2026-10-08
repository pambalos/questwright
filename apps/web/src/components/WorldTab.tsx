'use client';

import type { WorldDefs } from '@questwright/engine';

const SECTIONS: { key: keyof WorldDefs; title: string }[] = [
  { key: 'currencies', title: 'Currencies' },
  { key: 'stats', title: 'Stats' },
  { key: 'slots', title: 'Equipment slots' },
  { key: 'skills', title: 'Skills seen' },
  { key: 'blessings', title: 'Blessings' },
];

export function WorldTab({ world }: { world: WorldDefs }) {
  return (
    <>
      <p className="note">The rules of this story&apos;s system, built from what the manuscript has introduced so far. Every character shares these definitions.</p>
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
