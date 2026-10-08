'use client';

import type { ArtStyle, Look } from '@questwright/engine';
import { useId, type ReactNode } from 'react';
import { RARITY_COLOR, type Feature, type WeaponKind } from './gear';
import { tone } from './look';

const OUT = '#15110d';
const STEEL = '#c3cad3';
const LEATHER = '#6b4528';

interface Props {
  look: Look;
  features: Feature[];
  style: ArtStyle;
  /** Show only the head, for tab icons. */
  crop?: boolean;
  /** Draw a dark silhouette, for characters not yet drawn. */
  silhouette?: boolean;
  /** Slot or item key to light up. */
  highlight?: string | null;
  label: string;
}

/**
 * A full-body character drawn from look traits plus whatever the sheet says they
 * carry. Used for roster cards, tab icons, and where 3D is unavailable.
 */
export function Figure2D({ look, features, style, crop, silhouette, highlight, label }: Props) {
  const u = useId().replace(/:/g, '');
  const t = (hex: string, f = 1) => tone(hex, style, f);
  const g = (n: string) => `url(#${u}${n})`;
  const O = { stroke: OUT, strokeWidth: 1.3, strokeLinejoin: 'round' as const };
  const has = <K extends Feature['type']>(type: K) => features.filter((f): f is Extract<Feature, { type: K }> => f.type === type);
  const one = <K extends Feature['type']>(type: K) => has(type)[0];
  const lit = (key: string) => (highlight && key === highlight ? 'glow' : undefined);
  const grad = (id: string, hex: string) => (
    <linearGradient id={`${u}${id}`} x1="0" x2="1">
      <stop offset="0" stopColor={t(hex, 1.22)} />
      <stop offset=".55" stopColor={t(hex)} />
      <stop offset="1" stopColor={t(hex, 0.6)} />
    </linearGradient>
  );
  const rar = (r?: string) => RARITY_COLOR[(r as keyof typeof RARITY_COLOR) ?? 'common'] ?? RARITY_COLOR.common;

  const robe = look.outfit === 'robe';
  const cloak = look.outfit === 'cloak';
  const longBody = robe || cloak;
  const hood = look.hair === 'hood';
  const armor = one('armor');
  const gloves = one('gloves');
  const boots = one('boots');
  const helm = one('helm');
  const handL = { x: 66, y: 199 };
  const handR = { x: 134, y: 199 };

  const back: ReactNode[] = [];
  const cape = one('cape');
  if (cape || cloak) back.push(<path key="cape" data-fig={cape?.key} className={cape ? lit(cape.key) : undefined} d="M72 108 Q100 42 128 108 L148 306 Q100 320 52 306 Z" fill={cape ? t(look.accent, 0.75) : g('ck')} {...O} />);
  if (hood) back.push(<path key="hoodback" d="M78 100 Q74 50 100 46 Q126 50 122 100 Q100 108 78 100 Z" fill={g('ck')} {...O} />);
  const pack = one('pack');
  if (pack) back.push(<g key="pack" data-fig={pack.key} className={lit(pack.key)}><rect x="70" y="112" width="60" height="74" rx="9" fill={g('le')} {...O} /><rect x="68" y="104" width="64" height="12" rx="6" fill="#8a7f6a" {...O} /></g>);

  const legs = !longBody && (
    <>
      <path d="M84 204 L80 290 L95 291 L100 214 Z" fill={g('pa')} {...O} />
      <path d="M100 214 L105 291 L120 290 L116 204 Z" fill={g('pa')} {...O} />
    </>
  );
  const feet = longBody ? (
    <g data-fig={boots?.key} className={boots ? lit(boots.key) : undefined}>
      <ellipse cx="91" cy="309" rx="8" ry="4" fill={boots ? t(STEEL, 0.8) : g('bo')} {...O} />
      <ellipse cx="109" cy="309" rx="8" ry="4" fill={boots ? t(STEEL, 0.8) : g('bo')} {...O} />
    </g>
  ) : (
    <g data-fig={boots?.key} className={boots ? lit(boots.key) : undefined}>
      <path d="M79 282 L96 282 L97 312 L71 313 Q69 304 78 300 Z" fill={boots ? t(STEEL, 0.75) : g('bo')} {...O} />
      <path d="M104 282 L121 282 L122 300 Q131 304 129 313 L103 312 Z" fill={boots ? t(STEEL, 0.75) : g('bo')} {...O} />
      <path d="M79 288 H96 M104 288 H121" stroke={OUT} strokeOpacity=".5" />
    </g>
  );
  const sleeves = robe ? (
    <>
      <path d="M80 116 Q64 122 60 150 L54 196 L74 198 L80 150 Z" fill={g('cl')} {...O} />
      <path d="M120 116 Q136 122 140 150 L146 196 L126 198 L120 150 Z" fill={g('cl')} {...O} />
    </>
  ) : (
    <>
      <path d="M80 116 Q66 120 64 142 L60 192 L72 194 L80 150 Z" fill={g('cl')} {...O} />
      <path d="M120 116 Q134 120 136 142 L140 192 L128 194 L120 150 Z" fill={g('cl')} {...O} />
    </>
  );
  const hands = (
    <g data-fig={gloves?.key} className={gloves ? lit(gloves.key) : undefined}>
      <ellipse cx={handL.x} cy={handL.y} rx="6" ry="7" fill={gloves ? g('le') : g('sk')} {...O} />
      <ellipse cx={handR.x} cy={handR.y} rx="6" ry="7" fill={gloves ? g('le') : g('sk')} {...O} />
    </g>
  );
  const torso =
    look.outfit === 'robe' ? (
      <>
        <path d="M80 112 Q100 104 120 112 L134 302 Q100 312 66 302 Z" fill={g('cl')} {...O} />
        <path d="M78 168 Q100 175 122 168 L123 177 Q100 184 77 177 Z" fill={t(look.accent, 0.9)} {...O} />
      </>
    ) : look.outfit === 'coat' ? (
      <>
        <path d="M76 112 Q100 104 124 112 L132 252 Q100 260 68 252 Z" fill={g('cl')} {...O} />
        <path d="M100 112 V254" stroke={OUT} strokeOpacity=".4" />
      </>
    ) : look.outfit === 'cloak' ? (
      <>
        <path d="M80 112 Q100 104 120 112 L126 300 Q100 310 74 300 Z" fill={g('cl')} {...O} />
        <path d="M100 120 V300" stroke={OUT} strokeOpacity=".35" />
      </>
    ) : (
      <>
        <path d="M78 112 Q100 104 122 112 L124 170 L128 214 Q100 222 72 214 L76 170 Z" fill={g('cl')} {...O} />
        <path d="M92 108 L100 126 L108 108" fill="none" stroke={OUT} strokeWidth="1.3" />
      </>
    );
  const plate = (armor || look.outfit === 'armor') && (
    <g data-fig={armor?.key} className={armor ? lit(armor.key) : undefined}>
      <path d="M80 116 Q100 108 120 116 L118 176 Q100 184 82 176 Z" fill={t(STEEL, 0.85)} {...O} />
      <path d="M100 118 V178" stroke={OUT} strokeOpacity=".35" />
      <ellipse cx="76" cy="120" rx="13" ry="9" fill={t(STEEL, 0.75)} {...O} />
      <ellipse cx="124" cy="120" rx="13" ry="9" fill={t(STEEL, 0.75)} {...O} />
      {armor && <path d="M84 120 Q100 114 116 120" stroke={rar(armor.rarity)} strokeWidth="1.5" fill="none" />}
    </g>
  );
  const neck = <path d="M93 92 L107 92 L108 110 L92 110 Z" fill={g('sk')} {...O} />;
  const head = (
    <>
      <ellipse cx="85.5" cy="80" rx="3" ry="5" fill={g('sk')} {...O} />
      <ellipse cx="114.5" cy="80" rx="3" ry="5" fill={g('sk')} {...O} />
      <ellipse cx="100" cy="78" rx="15" ry="18" fill={g('sk')} {...O} />
      <ellipse cx="94" cy="79" rx="1.6" ry="2.1" fill={OUT} />
      <ellipse cx="106" cy="79" rx="1.6" ry="2.1" fill={OUT} />
      <path d="M90 74.5 L97 73.5 M103 73.5 L110 74.5" stroke={t(look.hairColor, 0.8)} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M100 80 L98.5 85 L101 85.5" stroke={t(look.skin, 0.7)} fill="none" />
      <path d="M96 89.5 Q100 91.5 104 89.5" stroke="#6b3a2c" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {one('scar') && <path d="M104 82 L113 91" stroke="#b8372b" strokeWidth="2.2" strokeLinecap="round" />}
    </>
  );
  const hair = (() => {
    switch (look.hair) {
      case 'spiky':
        return <path d="M84 77 Q80 57 92 54 L90 46 L98 51 L101 43 L106 51 L115 47 L112 56 Q121 62 116 77 Q113 66 106 63 Q100 70 92 65 Q88 70 84 77 Z" fill={g('ha')} {...O} />;
      case 'long':
        return (
          <>
            <path d="M85 82 Q83 60 100 58 Q117 60 115 82 Q112 70 100 66 Q88 70 85 82 Z" fill={g('ha')} {...O} />
            <path d="M85 80 Q82 104 88 112 L91 88 Z M115 80 Q118 104 112 112 L109 88 Z" fill={g('ha')} {...O} />
          </>
        );
      case 'bald':
        return <path d="M85 80 Q83 66 89 64 L90 82 Z M115 80 Q117 66 111 64 L110 82 Z" fill={g('ha')} {...O} />;
      case 'hood':
        return <path d="M79 101 Q73 52 100 47 Q127 52 121 101" fill="none" stroke={t(look.cloth, 0.55)} strokeWidth="4" />;
      default:
        return <path d="M84 76 Q82 56 100 56 Q118 56 116 76 Q112 64 100 63 Q88 64 84 76 Z" fill={g('ha')} {...O} />;
    }
  })();
  const helmet = helm && (
    <g data-fig={helm.key} className={lit(helm.key)}>
      <path d="M83 74 Q83 52 100 52 Q117 52 117 74 Z" fill={t(STEEL, 0.85)} {...O} />
      <path d="M100 56 V86" stroke={t(STEEL, 0.6)} strokeWidth="3" />
      <path d="M85 72 H115" stroke={rar(helm.rarity)} strokeWidth="1.5" />
    </g>
  );

  const gear: ReactNode[] = [];
  const mantle = one('mantle');
  if (mantle) gear.push(
    <g key="mantle" data-fig={mantle.key} className={lit(mantle.key)}>
      <path d="M70 114 Q100 97 130 114 L133 133 L127 128 L122 136 L116 129 L110 137 L104 130 L98 137 L92 130 L86 137 L80 129 L74 135 L69 130 Z" fill={g('fu')} {...O} />
      <path d="M121 109 Q131 101 137 111 L131 118 Z" fill={g('fu')} {...O} />
    </g>,
  );
  if (one('belt') && !robe) gear.push(
    <g key="belt">
      <path d="M74 182 Q100 189 126 182 L126 191 Q100 198 74 191 Z" fill={g('le')} {...O} />
      <rect x="96" y="184" width="8" height="8" rx="1.5" fill="none" stroke="#d6a443" strokeWidth="1.8" />
    </g>,
  );
  const pouch = one('pouch');
  if (pouch) gear.push(<g key="pouch" data-fig={pouch.key} className={lit(pouch.key)}><path d="M77 191 Q74 203 81 205 Q88 203 85 191 Z" fill={g('le')} {...O} /><path d="M77 193 H85" stroke="#d6a443" strokeWidth="1.5" /></g>);
  const potions = one('potions');
  if (potions)
    gear.push(
      <g key="potions" data-fig={potions.key} className={lit(potions.key)}>
        {Array.from({ length: Math.min(potions.count, 3) }, (_, i) => (
          <g key={i}>
            <rect x={89.8 + i * 7} y="193" width="2.4" height="3.5" fill="#cfd6dc" stroke={OUT} strokeWidth=".8" />
            <circle cx={91 + i * 7} cy="200.5" r="3.6" fill="#c23a2e" {...O} />
            <circle cx={89.8 + i * 7} cy="199.3" r="1" fill="#ffd3c9" />
          </g>
        ))}
      </g>,
    );
  for (const s of has('sheathed'))
    gear.push(
      <g key={`sh${s.key}`} data-fig={s.key} className={lit(s.key)}>
        <path d={s.kind === 'sword' ? 'M115 187 L134 262 L129 264 L110 190 Z' : 'M115 187 L127 228 L122 230 L110 190 Z'} fill="#3a2516" {...O} />
        <path d="M108 186 L121 180" stroke={rar(s.rarity) === RARITY_COLOR.common ? STEEL : rar(s.rarity)} strokeWidth="3" strokeLinecap="round" />
        <path d="M113 182 L110 171" stroke="#5b3a22" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="109.5" cy="169.5" r="2.6" fill={STEEL} {...O} />
      </g>,
    );
  const trinket = one('trinket');
  if (trinket) gear.push(<circle key="trinket" data-fig={trinket.key} className={lit(trinket.key)} cx="84" cy="198" r="3.5" fill={rar(trinket.rarity)} {...O} />);
  const amulet = one('amulet');
  if (amulet) gear.push(<g key="amulet" data-fig={amulet.key} className={lit(amulet.key)}><path d="M91 109 Q100 124 109 109" fill="none" stroke="#d6a443" strokeWidth="1.2" /><circle cx="100" cy="121" r="3.2" fill={rar(amulet.rarity)} {...O} /></g>);
  const trophy = one('trophy');
  if (trophy && !amulet)
    gear.push(
      <g key="trophy" data-fig={trophy.key} className={lit(trophy.key)}>
        <path d="M91 109 Q100 121 109 109" fill="none" stroke="#6b4a2a" strokeWidth="1.2" />
        <path d="M94.5 113.5 L96 119 L97.5 114.5 Z M98.8 115.6 L100 121.5 L101.2 115.6 Z M102.5 114.5 L104 119 L105.5 113.5 Z" fill="#f1eadb" stroke={OUT} strokeWidth=".6" />
      </g>,
    );
  const sigil = one('sigil');
  if (sigil) gear.push(<g key="sigil" data-fig={sigil.key} className={lit(sigil.key)}><circle cx="100" cy="146" r="9" fill="#ffe7a3" opacity=".5" filter={`url(#${u}gl)`} className="pulse" /><path d="M100 138 L106 146 L100 154 L94 146 Z" fill="#f6d27a" {...O} /></g>);
  if (one('tattoo')) gear.push(<path key="tattoo" d="M62 160 l6 4 -6 4 6 4" stroke="#2b4a7a" strokeWidth="1.4" fill="none" />);

  const fx: ReactNode[] = [];
  const weapon = one('weapon');
  if (weapon) fx.push(<g key="weapon" data-fig={weapon.key} className={lit(weapon.key)}>{weaponShape(weapon.kind, handR, rar(weapon.rarity))}</g>);
  const shield = one('shield');
  if (shield)
    fx.push(
      <g key="shield" data-fig={shield.key} className={lit(shield.key)}>
        <path d="M40 148 Q56 140 72 148 Q72 182 56 194 Q40 182 40 148 Z" fill={t(look.accent, 0.85)} {...O} />
        <path d="M56 150 V188 M44 162 H68" stroke={rar(shield.rarity)} strokeWidth="2" />
      </g>,
    );
  for (const r of has('ring'))
    fx.push(
      <g key={`ring${r.key}`} data-fig={r.key} className={lit(r.key)}>
        <circle cx={handR.x} cy={handR.y + 2} r="10" fill={rar(r.rarity) === RARITY_COLOR.common ? '#ffd27a' : rar(r.rarity)} opacity=".4" filter={`url(#${u}gl)`} className="pulse" />
        <ellipse cx={handR.x} cy={handR.y + 3.5} rx="4" ry="2" fill="none" stroke="#2b2b2f" strokeWidth="2.2" />
      </g>,
    );
  if (one('embers'))
    fx.push(<g key="embers">{[0, 1, 2, 3].map((i) => <circle key={i} className="ember" cx={handL.x - 5 + i * 3.5} cy={handL.y - 5 - i * 5} r={1.8 - i * 0.3} fill="#ffb054" style={{ animationDelay: `${i * 0.55}s` }} />)}</g>);
  if (one('frost'))
    fx.push(<g key="frost">{[0, 1, 2].map((i) => <path key={i} className="ember" d={`M${handR.x - 4 + i * 4} ${handR.y - 10 - i * 6} l2 2 -2 2 -2 -2 z`} fill="#bfe6ff" style={{ animationDelay: `${i * 0.7}s` }} />)}</g>);
  const ward = one('ward');
  if (ward && !shield)
    fx.push(
      <g key="ward" data-fig={ward.key} className={lit(ward.key)}>
        <polygon points={hexPoints(56, 166, 20)} fill="#ff8a2a" opacity=".35" filter={`url(#${u}gl)`} />
        <polygon points={hexPoints(56, 166, 20)} fill="#ff8a2a" fillOpacity=".14" stroke="#ffa24a" strokeWidth="1.6" className="pulse" />
      </g>,
    );
  const glow = one('glow');
  if (glow)
    fx.push(
      <g key="glow" data-fig={glow.key} className={lit(glow.key)}>
        {[handL, handR].map((h, i) => (
          <g key={i}>
            <circle cx={h.x} cy={h.y + 3} r="10" fill="#fff1b8" opacity=".6" filter={`url(#${u}gl)`} className="pulse" />
            <circle cx={h.x} cy={h.y + 3} r="3" fill="#fffbe6" />
          </g>
        ))}
      </g>,
    );

  const body = (
    <g className="brt" transform={`translate(100 316) scale(${look.build}) translate(-100 -316)`}>
      {back}
      {legs}
      {feet}
      {sleeves}
      {hands}
      {neck}
      {torso}
      {plate}
      {gear}
      {head}
      {hair}
      {helmet}
      {fx}
    </g>
  );

  return (
    <svg viewBox={crop ? (hood ? '74 40 52 52' : '79 46 42 42') : '0 0 200 340'} role="img" aria-label={label}>
      <defs>
        <radialGradient id={`${u}bg`} cx=".5" cy=".45" r=".75">
          <stop offset="0" stopColor={t(look.cloth, 0.55)} />
          <stop offset="1" stopColor="#0b0c12" />
        </radialGradient>
        {grad('sk', look.skin)}
        {grad('cl', look.cloth)}
        {grad('ck', shade(look.cloth))}
        {grad('pa', '#3d3a36')}
        {grad('bo', '#3b2617')}
        {grad('ha', look.hairColor)}
        {grad('le', LEATHER)}
        {grad('fu', '#9b968f')}
        <filter id={`${u}gl`} x="-2" y="-2" width="5" height="5">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={`${u}si`}>
          <feFlood floodColor="#2c3044" />
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <rect width="200" height="340" fill={g('bg')} />
      {!crop && (
        <>
          <ellipse cx="100" cy="318" rx="66" ry="12" fill="none" stroke="#d6a443" strokeOpacity=".22" />
          <ellipse cx="100" cy="316" rx="44" ry="7" fill="#000" opacity=".45" />
        </>
      )}
      {silhouette ? (
        <>
          <g filter={`url(#${u}si)`}>{body}</g>
          {!crop && <text x="100" y="200" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="40" fill="#5c6380">?</text>}
        </>
      ) : (
        body
      )}
    </svg>
  );
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.72).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i + 30);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function weaponShape(kind: WeaponKind, h: { x: number; y: number }, edge: string): ReactNode {
  const O = { stroke: OUT, strokeWidth: 1.2, strokeLinejoin: 'round' as const };
  const glowEdge = edge === RARITY_COLOR.common ? STEEL : edge;
  switch (kind) {
    case 'sword':
      return (
        <>
          <path d={`M${h.x - 2} ${h.y - 8} L${h.x + 10} ${h.y - 92} L${h.x + 14} ${h.y - 90} L${h.x + 3} ${h.y - 6} Z`} fill={STEEL} {...O} />
          <path d={`M${h.x + 3} ${h.y - 92} L${h.x + 12} ${h.y - 91}`} stroke={glowEdge} strokeWidth="2" />
          <path d={`M${h.x - 9} ${h.y - 8} L${h.x + 10} ${h.y - 4}`} stroke="#8a6a3a" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'dagger':
      return (
        <>
          <path d={`M${h.x - 1} ${h.y - 6} L${h.x + 6} ${h.y - 40} L${h.x + 9} ${h.y - 39} L${h.x + 3} ${h.y - 5} Z`} fill={STEEL} {...O} />
          <path d={`M${h.x - 6} ${h.y - 6} L${h.x + 8} ${h.y - 3}`} stroke="#8a6a3a" strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
    case 'staff':
      return (
        <>
          <path d={`M${h.x + 6} ${h.y + 110} L${h.x - 6} ${h.y - 112}`} stroke="#6b4a2a" strokeWidth="4" strokeLinecap="round" />
          <circle cx={h.x - 6} cy={h.y - 118} r="7" fill={glowEdge} opacity=".85" />
        </>
      );
    case 'axe':
      return (
        <>
          <path d={`M${h.x + 2} ${h.y + 10} L${h.x + 8} ${h.y - 70}`} stroke="#6b4a2a" strokeWidth="4" strokeLinecap="round" />
          <path d={`M${h.x + 7} ${h.y - 70} Q${h.x + 30} ${h.y - 62} ${h.x + 26} ${h.y - 44} Q${h.x + 16} ${h.y - 52} ${h.x + 7} ${h.y - 52} Z`} fill={STEEL} {...O} />
        </>
      );
    case 'bow':
      return (
        <>
          <path d={`M${h.x + 4} ${h.y - 70} Q${h.x + 30} ${h.y} ${h.x + 4} ${h.y + 70}`} fill="none" stroke="#6b4a2a" strokeWidth="3.5" />
          <path d={`M${h.x + 4} ${h.y - 70} L${h.x + 4} ${h.y + 70}`} stroke="#e8e4d6" strokeWidth=".8" />
        </>
      );
    case 'mace':
      return (
        <>
          <path d={`M${h.x + 2} ${h.y + 8} L${h.x + 6} ${h.y - 50}`} stroke="#6b4a2a" strokeWidth="4" strokeLinecap="round" />
          <circle cx={h.x + 6} cy={h.y - 56} r="9" fill={STEEL} {...O} />
        </>
      );
    default:
      return <circle cx={h.x} cy={h.y - 14} r="6" fill={glowEdge} opacity=".9" className="pulse" />;
  }
}
