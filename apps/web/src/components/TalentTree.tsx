'use client';

import { label, type MagicSystem, type PlacedParagraph, type Sheet } from '@questwright/engine';
import { useId, useMemo, useState } from 'react';

interface Props {
  system: MagicSystem;
  flat: PlacedParagraph[];
  onJump(pid: string): void;
  /** The character whose panel this is. Without one, the tree shows what the whole world has seen. */
  sheet?: Sheet;
}

interface Node {
  name: string;
  /** A "?" for a next step the story has not revealed yet. */
  hint: boolean;
  /** This character has it (or, in the world view, someone does). */
  lit: boolean;
  /** Seen in the world, but not by this character. */
  known: boolean;
  level?: number;
  at?: string;
  holders: number;
  children: Node[];
  depth: number;
  col: number;
}

type View = 'constellation' | 'talents';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small deterministic random sequence, so a system's sky looks the same every time. */
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909);
    return ((s ^= s >>> 16) >>> 0) / 4294967296;
  };
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const rank = (n?: number) => (n === undefined ? '' : n <= 10 ? ROMAN[n]! : String(n));
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** Builds the forest of skills, adds "?" stars past what has been learned, and lays it out in columns and tiers. */
function layout(system: MagicSystem, sheet?: Sheet) {
  const own = (sheet?.skills ?? []).filter((k) => k.system === system.name);
  const mine = new Map<string, { level?: number; at?: string }>(own.map((k) => [k.name, k]));
  // A skill that evolved into another was still learned: its star stays lit.
  for (const k of own) if (k.evolvedFrom && !mine.has(k.evolvedFrom)) mine.set(k.evolvedFrom, {});
  const nodes = new Map<string, Node>();
  for (const k of system.skills) {
    const has = sheet ? mine.has(k.name) : true;
    nodes.set(k.name, {
      name: k.name,
      hint: false,
      lit: has,
      known: !has,
      level: sheet ? mine.get(k.name)?.level : undefined,
      at: (sheet && mine.get(k.name)?.at) || k.at,
      holders: k.holders.length,
      children: [],
      depth: 0,
      col: 0,
    });
  }
  const roots: Node[] = [];
  for (const k of system.skills) {
    const n = nodes.get(k.name)!;
    const parent = k.requires ? nodes.get(k.requires) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  const hint = (): Node => ({ name: '?', hint: true, lit: false, known: false, holders: 0, children: [], depth: 0, col: 0 });
  // Discover as you go: past every learned tip lies something not yet written.
  const sprout = (n: Node) => {
    n.children.forEach(sprout);
    if (n.lit && !n.children.length) n.children.push(hint());
  };
  roots.forEach(sprout);
  if (!roots.length) roots.push(hint());
  let col = 0;
  let depth = 0;
  const place = (n: Node, d: number) => {
    n.depth = d;
    depth = Math.max(depth, d);
    if (!n.children.length) n.col = col++;
    else {
      n.children.forEach((c) => place(c, d + 1));
      n.col = n.children.reduce((s, c) => s + c.col, 0) / n.children.length;
    }
  };
  roots.forEach((r) => place(r, 0));
  const all: Node[] = [];
  const walk = (n: Node) => {
    all.push(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return { all, cols: Math.max(col, 1), depth, learned: mine.size };
}

export function TalentTree({ system, flat, onJump, sheet }: Props) {
  const [view, setView] = useState<View>('constellation');
  const uid = useId().replace(/:/g, '');
  const hue = hash(system.name) % 360;
  const tint = `hsl(${hue} 85% 68%)`;
  const deep = `hsl(${hue} 60% 22%)`;
  const { all, cols, depth, learned } = useMemo(() => layout(system, sheet), [system, sheet]);
  const where = (pid?: string) => {
    const p = pid ? flat.find((x) => x.id === pid) : undefined;
    return p ? label(p) : '';
  };
  const tip = (n: Node) =>
    n.hint
      ? 'Not yet discovered'
      : [n.name, n.level !== undefined ? `Level ${n.level}` : '', sheet ? (n.lit ? `learned ${where(n.at)}` : 'seen in the world, not learned') : `${n.holders} ${n.holders === 1 ? 'character' : 'characters'} · first seen ${where(n.at)}`]
          .filter(Boolean)
          .join(' · ');
  const act = (n: Node) => (n.hint || !n.at ? undefined : () => onJump(n.at!));

  const W = 360;
  const pad = 30;
  const colW = (W - pad * 2) / cols;

  return (
    <div className="talents" style={{ '--tint': tint, '--deep': deep } as React.CSSProperties}>
      <div className="talents-bar">
        <span className="talents-count">
          {sheet ? `${learned} of ${system.skills.length} known ${system.skills.length === 1 ? 'star' : 'stars'}` : `${system.skills.length} ${system.skills.length === 1 ? 'skill' : 'skills'} seen`}
        </span>
        <div className="seg-mini" role="group" aria-label="Tree view">
          <button className={view === 'constellation' ? 'on' : ''} aria-pressed={view === 'constellation'} onClick={() => setView('constellation')}>Constellation</button>
          <button className={view === 'talents' ? 'on' : ''} aria-pressed={view === 'talents'} onClick={() => setView('talents')}>Talents</button>
        </div>
      </div>
      {view === 'constellation' ? constellation() : talents()}
    </div>
  );

  function constellation() {
    const rowH = 66;
    const H = pad * 2 + depth * rowH + 18;
    const r = rng(hash(system.name));
    const sky = Array.from({ length: 46 }, () => ({ x: r() * W, y: r() * H, s: r() * 1.1 + 0.25, o: r() * 0.5 + 0.15 }));
    // Stars sit a little off the grid so a tree reads as a constellation, not a chart.
    const jitter = new Map(all.map((n, i) => {
      const j = rng(hash(`${system.name}/${n.name}/${i}`));
      return [n, { dx: (j() - 0.5) * Math.min(colW * 0.5, 26), dy: (j() - 0.5) * 14 }];
    }));
    const pos = (n: Node) => ({ x: pad + (n.col + 0.5) * colW + jitter.get(n)!.dx, y: H - pad - 10 - n.depth * rowH + jitter.get(n)!.dy });
    return (
      <svg className="sky" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${system.name} constellation`}>
        <defs>
          <radialGradient id={`${uid}-sky`} cx="50%" cy="100%" r="110%">
            <stop offset="0" stopColor={deep} />
            <stop offset="0.6" stopColor="#0b0d17" />
            <stop offset="1" stopColor="#05060b" />
          </radialGradient>
          <filter id={`${uid}-glow`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>
        <rect width={W} height={H} rx="8" fill={`url(#${uid}-sky)`} />
        {sky.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#dfe6ff" opacity={s.o} />)}
        {all.flatMap((n) =>
          n.children.map((c) => {
            const a = pos(n);
            const b = pos(c);
            const bright = n.lit && c.lit;
            return (
              <line key={`${n.name}>${c.name}>${c.col}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={bright ? tint : '#8a93b8'} strokeWidth={bright ? 1.6 : 1} strokeOpacity={bright ? 0.9 : c.hint ? 0.18 : 0.35}
                strokeDasharray={c.hint ? '2 4' : undefined} />
            );
          }),
        )}
        {all.map((n) => {
          const { x, y } = pos(n);
          const onClick = act(n);
          return (
            <g key={`${n.name}@${n.col}/${n.depth}`} className={`star${n.lit ? ' lit' : ''}${n.hint ? ' hint' : ''}`} transform={`translate(${x} ${y})`}
              onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
              onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}>
              <title>{tip(n)}</title>
              {n.lit && <circle r="11" fill={tint} opacity="0.55" filter={`url(#${uid}-glow)`} />}
              {n.lit ? (
                <>
                  <path d="M0 -9 L1.6 -1.6 L9 0 L1.6 1.6 L0 9 L-1.6 1.6 L-9 0 L-1.6 -1.6 Z" fill="#fff" opacity="0.9" />
                  <circle r="3.4" fill="#fff" />
                </>
              ) : n.hint ? (
                <>
                  <circle r="5" fill="none" stroke="#9aa3c7" strokeOpacity="0.35" strokeDasharray="1.5 2.5" />
                  <text y="3" textAnchor="middle" className="star-q">?</text>
                </>
              ) : (
                <circle r="3.6" fill="none" stroke={tint} strokeOpacity="0.6" strokeWidth="1.2" />
              )}
              {!n.hint && (
                <text y="20" textAnchor="middle" className="star-name">
                  {n.name}
                  {n.level !== undefined && <tspan className="star-rank"> {rank(n.level)}</tspan>}
                </text>
              )}
            </g>
          );
        })}
        <text x="12" y="20" className="sky-title">{system.name}</text>
      </svg>
    );
  }

  function talents() {
    const rowH = 74;
    const tile = 38;
    const H = pad + depth * rowH + tile + 34;
    const pos = (n: Node) => ({ x: pad + (n.col + 0.5) * colW, y: pad - 6 + n.depth * rowH });
    return (
      <svg className="grid-tree" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${system.name} talents`}>
        <defs>
          <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
          </marker>
          <linearGradient id={`${uid}-tile`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tint} stopOpacity="0.55" />
            <stop offset="1" stopColor={deep} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} rx="8" fill="#0c0e15" />
        {Array.from({ length: depth + 1 }, (_, d) => (
          <text key={d} x="8" y={pad - 6 + d * rowH + tile / 2 + 4} className="tier">{ROMAN[d + 1] ?? d + 1}</text>
        ))}
        {all.flatMap((n) =>
          n.children.map((c) => {
            const a = pos(n);
            const b = pos(c);
            const on = n.lit && c.lit;
            return (
              <line key={`${n.name}>${c.name}>${c.col}`} x1={a.x} y1={a.y + tile / 2 + 2} x2={b.x} y2={b.y - tile / 2 - 4}
                stroke={on ? tint : '#4a5170'} strokeWidth={on ? 2 : 1.4} strokeDasharray={c.hint ? '3 4' : undefined}
                markerEnd={`url(#${uid}-arrow)`} />
            );
          }),
        )}
        {all.map((n) => {
          const { x, y } = pos(n);
          const onClick = act(n);
          return (
            <g key={`${n.name}@${n.col}/${n.depth}`} className={`tile-t${n.lit ? ' lit' : ''}${n.hint ? ' hint' : ''}`} transform={`translate(${x} ${y})`}
              onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
              onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}>
              <title>{tip(n)}</title>
              <rect x={-tile / 2} y={-tile / 2} width={tile} height={tile} rx="7"
                fill={n.lit ? `url(#${uid}-tile)` : '#161a26'} stroke={n.lit ? tint : n.hint ? '#3a4058' : '#5a6380'}
                strokeWidth={n.lit ? 2 : 1.2} strokeDasharray={n.hint ? '3 3' : undefined} />
              <text y="5" textAnchor="middle" className={n.hint ? 'tile-q' : 'tile-i'}>{n.hint ? '?' : initials(n.name)}</text>
              {n.lit && n.level !== undefined && (
                <g transform={`translate(${tile / 2 - 3} ${tile / 2 - 3})`}>
                  <rect x="-10" y="-8" width="20" height="14" rx="4" fill="#0c0e15" stroke={tint} />
                  <text y="3" textAnchor="middle" className="tile-rank">{n.level}</text>
                </g>
              )}
              {!n.hint && <text y={tile / 2 + 13} textAnchor="middle" className="tile-name">{n.name}</text>}
            </g>
          );
        })}
      </svg>
    );
  }
}
