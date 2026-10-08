'use client';

import { FREE_POINTS, label, type ContinuityWarning, type PanelKey, type PlacedParagraph, type Sheet, type WorldDefs } from '@questwright/engine';
import type { ReactNode } from 'react';
import { useStudio } from '@/lib/store';

const CORE_STATS = new Set(['Level', FREE_POINTS]);
const rar = (r?: string) => `var(--r-${r ?? 'common'})`;
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 3);

interface Props {
  sheet: Sheet;
  world: WorldDefs;
  warnings: ContinuityWarning[];
  flat: PlacedParagraph[];
  onJump(pid: string): void;
}

export function CharacterSheet({ sheet, world, warnings, flat, onJump }: Props) {
  const character = useStudio((s) => s.project.characters[sheet.characterId]);
  const togglePin = useStudio((s) => s.togglePin);
  const name = character?.name ?? sheet.characterId;
  const at = (i?: number) => (i === undefined ? '—' : label(flat[i]!));
  const slots = world.slots;
  const left = slots.filter((_, i) => i % 2 === 0);
  const right = slots.filter((_, i) => i % 2 === 1);
  const pad = (xs: (string | null)[]) => [...xs, ...Array(Math.max(0, 4 - xs.length)).fill(null)] as (string | null)[];
  const tag = [sheet.stats.Level !== undefined ? `Level ${sheet.stats.Level}` : null, sheet.className].filter(Boolean).join(' · ');

  const tile = (slot: string | null, i: number) => {
    if (!slot) return <div key={`l${i}`} className="tile locked" title="Undiscovered slot. It appears when the story equips something new.">?</div>;
    const it = sheet.equipment[slot];
    return (
      <div key={slot} className={`tile${it ? '' : ' empty'}`} title={`${slot}: ${it ? it.item : 'empty'}`} style={it ? ({ '--rar': rar(it.rarity) } as React.CSSProperties) : undefined}>
        {it && <b>{initials(it.item)}</b>}
        <small>{slot}</small>
      </div>
    );
  };

  return (
    <>
      <section className="doll" aria-label={`${name}'s calling card`}>
        <div className="doll-top">
          <h3>{name}</h3>
          {tag && <div className="ep">{tag}</div>}
        </div>
        <div className="doll-grid">
          <div className="scol">{pad(left).map(tile)}</div>
          <div className="figure" title="The 3D figure arrives in the next milestone.">
            <svg viewBox="0 0 120 220" role="img" aria-label={`${name}, figure not drawn yet`}>
              <ellipse cx="60" cy="212" rx="34" ry="6" fill="#000" opacity=".45" />
              <path d="M38 82 Q60 72 82 82 L86 150 L76 150 L74 206 L64 206 L60 156 L56 206 L46 206 L44 150 L34 150 Z" fill="#30344a" />
              <circle cx="60" cy="52" r="18" fill="#30344a" />
              <text x="60" y="132" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="22" fill="#5c6380">{initials(name)}</text>
            </svg>
          </div>
          <div className="scol">{pad(right).map(tile)}</div>
        </div>
        <div className="card-info">
          {character?.description && <p>{character.description}</p>}
          {!!character?.aliases.length && <div className="meta">Also called: {character.aliases.join(', ')}</div>}
          <div className="meta">
            {character?.role ? `${character.role} · ` : ''}first seen {at(sheet.firstSeen)} · last seen {at(sheet.lastSeen)}
            {sheet.appearance.version > 1 && ` · appearance v${sheet.appearance.version}: ${sheet.appearance.note}`}
          </div>
          <div className="meta">
            <button className={`mini${character?.pinned ? ' on' : ''}`} aria-pressed={!!character?.pinned} onClick={() => togglePin(sheet.characterId)}>
              {character?.pinned ? 'Pinned to tabs' : 'Pin to tabs'}
            </button>
          </div>
        </div>
      </section>
      {sheet.panels.filter((p) => p !== 'equipment').map((p) => (
        <Section key={p} id={`${sheet.characterId}:${p}`} title={TITLES[p]} count={count(sheet, p)}>
          {body(sheet, p, warnings.filter((w) => w.characterId === sheet.characterId), flat, onJump)}
        </Section>
      ))}
    </>
  );
}

const TITLES: Record<PanelKey, string> = {
  stats: 'Stats', equipment: 'Equipment', inventory: 'Inventory', skills: 'Skills', currencies: 'Currencies', blessings: 'Blessings', titles: 'Titles',
};

function count(s: Sheet, p: PanelKey): string | undefined {
  if (p === 'inventory') return `${Object.keys(s.items).length} items`;
  if (p === 'skills') return `${s.skills.length}`;
  if (p === 'titles') return `${s.titles.length}`;
  return undefined;
}

function body(s: Sheet, p: PanelKey, warnings: ContinuityWarning[], flat: PlacedParagraph[], onJump: (pid: string) => void): ReactNode {
  switch (p) {
    case 'stats': {
      const stats = Object.entries(s.stats).filter(([k]) => !CORE_STATS.has(k));
      const free = s.stats[FREE_POINTS];
      return (
        <>
          <div className="lvl"><b>{s.stats.Level ?? '?'}</b><span>Level{s.className ? ` · ${s.className}` : ''}</span></div>
          {(stats.length > 0 || !!free) && (
            <div className="stats">
              {stats.map(([k, v]) => <div key={k} className="stat"><small>{k}</small><b>{v}</b></div>)}
              {!!free && <div className="stat free"><small>Free</small><b>{free}</b></div>}
            </div>
          )}
        </>
      );
    }
    case 'inventory':
      return (
        <div className="bag">
          {Object.entries(s.items).map(([n, v]) => (
            <div key={n} className="cell" title={n}>
              <span className="glyph" style={{ color: rar(v.rarity) }}>{initials(n)}</span>
              <span className="nm">{n}</span>
              <span className="qty">{v.count}</span>
            </div>
          ))}
          {!Object.keys(s.items).length && <p className="note">Empty for now.</p>}
        </div>
      );
    case 'skills':
      return (
        <div className="rows">
          {s.skills.map((k) => (
            <div className="row" key={k.name}>
              <span>{k.name}{k.evolvedFrom && <span className="sub">Evolved from {k.evolvedFrom}</span>}</span>
              <span className="pips" title={`Level ${k.level}`}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < Math.min(k.level, 10) ? 'on' : ''} />)}</span>
            </div>
          ))}
        </div>
      );
    case 'currencies':
      return (
        <div className="rows">
          {Object.entries(s.currencies).map(([n, v]) => {
            const w = warnings.find((x) => x.kind === 'negative-currency' && x.message.includes(`'s ${n} `));
            return (
              <div key={n} className={`row${v < 0 ? ' bad' : ''}`}>
                <span>
                  <span className="coin" />{n}
                  {v < 0 && w && <button className="warn-link" onClick={() => onJump(w.paragraphId)}>{w.message}. Check that scene.</button>}
                </span>
                <span className="val">{v}</span>
              </div>
            );
          })}
        </div>
      );
    case 'blessings':
      return (
        <>
          <div className="row" style={{ marginBottom: 6 }}><span><span className="coin" style={{ background: '#e9c9ff' }} />Blessing Points</span><span className="val">{s.blessingPoints}</span></div>
          <div className="badges">{s.blessings.map((b) => <span key={b} className="badge">{b}</span>)}</div>
        </>
      );
    case 'titles':
      return <div className="badges">{s.titles.map((t) => <span key={t} className="badge">{t}</span>)}</div>;
    case 'equipment':
      void flat;
      return null;
  }
}

function Section({ id, title, count, children }: { id: string; title: string; count?: string; children: ReactNode }) {
  const collapsed = useStudio((s) => s.collapsed.includes(id));
  const toggle = useStudio((s) => s.toggleCollapsed);
  return (
    <section className={`pnl${collapsed ? ' collapsed' : ''}`}>
      <button className="pnl-h" aria-expanded={!collapsed} onClick={() => toggle(id)}>
        {title}
        {count && <span className="cnt">{count}</span>}
        <span className="chev" aria-hidden="true">▾</span>
      </button>
      {!collapsed && <div className="pnl-b">{children}</div>}
    </section>
  );
}
