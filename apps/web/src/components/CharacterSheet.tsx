'use client';

import { FREE_POINTS, label, slotFor, type Rarity, type ArtStyle, type ContinuityWarning, type HairStyle, type Look, type Outfit, type PanelKey, type PlacedParagraph, type Sheet, type WorldDefs } from '@questwright/engine';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { studioCharacter } from '@/figure/studio';
import { CharacterModel } from '@/figure/vrm/CharacterModel';
import { frameFromProse, modelFor } from '@/figure/vrm/models';
import { desktop } from '@/lib/desktop';
import { gearFor } from '@/figure/gear';
import { lookOf } from '@/figure/look';
import { useStudio } from '@/lib/store';

const CORE_STATS = new Set(['Level', FREE_POINTS]);
const rar = (r?: string) => `var(--r-${r ?? 'common'})`;
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 3);
const OUTFITS: Outfit[] = ['tunic', 'coat', 'robe', 'cloak', 'armor'];
const HAIR: HairStyle[] = ['short', 'spiky', 'long', 'bald', 'hood'];

/** The character last sent to Questwright Studio, whose file follows the story while the app runs. */
let liveInStudio: string | null = null;

interface Props {
  sheet: Sheet;
  world: WorldDefs;
  warnings: ContinuityWarning[];
  flat: PlacedParagraph[];
  /** Paragraph the panel is showing; author corrections are recorded there. */
  atPid: string | null;
  onJump(pid: string): void;
}

export function CharacterSheet({ sheet, world, warnings, flat, atPid, onJump }: Props) {
  const character = useStudio((s) => s.project.characters[sheet.characterId]);
  const style: ArtStyle = useStudio((s) => s.project.art?.style ?? 'painterly');
  const togglePin = useStudio((s) => s.togglePin);
  const toggleLock = useStudio((s) => s.toggleAppearanceLock);
  const setLook = useStudio((s) => s.setLook);
  const setValue = useStudio((s) => s.setValue);
  const wear = useStudio((s) => s.wear);
  const [hover, setHover] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const features = useMemo(() => gearFor(sheet), [sheet]);
  const manuscript = useStudio((s) => s.manuscript);
  const suggested = useMemo(
    () => (character ? frameFromProse(manuscript.chapters.flatMap((c) => c.paragraphs.map((p) => p.text)), [character.name, ...character.aliases]) : undefined),
    [manuscript, character],
  );
  const protagonistId = useStudio((s) => s.project.protagonistId);
  const look = useMemo(() => (character ? lookOf(character, protagonistId) : null), [character, protagonistId]);
  const toast = useStudio((s) => s.toast);
  const studioJson = useMemo(
    () => (character && look ? JSON.stringify(studioCharacter(character, sheet, look, modelFor(look, character, suggested))) : ''),
    [character, sheet, look, suggested],
  );
  // While the studio shows this character, keep its file in step with the story.
  useEffect(() => {
    if (studioJson && liveInStudio === sheet.characterId) void desktop()?.openStudio?.(studioJson, false);
  }, [studioJson, sheet.characterId]);
  if (!character || !look) return null;
  const openStudio = async () => {
    liveInStudio = sheet.characterId;
    const error = await desktop()?.openStudio?.(studioJson, true);
    if (error) toast({ kind: 'error', head: 'Studio did not open', body: error });
  };

  const name = character.name;
  const at = (i?: number) => (i === undefined ? '—' : label(flat[i]!));
  const slots = world.slots;
  const pad = (xs: (string | null)[]) => [...xs, ...Array(Math.max(0, 4 - xs.length)).fill(null)] as (string | null)[];
  const left = pad(slots.filter((_, i) => i % 2 === 0));
  const right = pad(slots.filter((_, i) => i % 2 === 1));
  const tag = [sheet.stats.Level !== undefined ? `Level ${sheet.stats.Level}` : null, sheet.className].filter(Boolean).join(' · ');
  const correct = (kind: 'currency' | 'item', item: string, current: number) => {
    if (!atPid) return;
    const raw = window.prompt(`Set ${name}'s ${item} as of this point in the story`, String(current));
    if (raw === null) return;
    const n = Number(raw.trim());
    if (Number.isFinite(n)) setValue(atPid, sheet.characterId, kind, item, n);
  };
  const tile = (slot: string | null, i: number) => {
    if (!slot) return <div key={`l${i}`} className="tile locked" title="Undiscovered slot. It appears when the story equips something new.">?</div>;
    const it = sheet.equipment[slot];
    return (
      <div
        key={slot}
        data-slot={slot}
        tabIndex={0}
        className={`tile${it ? '' : ' empty'}`}
        title={`${slot}: ${it ? it.item : 'empty'}`}
        style={it ? ({ '--rar': rar(it.rarity) } as React.CSSProperties) : undefined}
        onMouseEnter={() => setHover(slot)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(slot)}
        onBlur={() => setHover(null)}
      >
        {it && <b>{initials(it.item)}</b>}
        <small>{slot}</small>
      </div>
    );
  };
  const set = (patch: Partial<Look>) => setLook(sheet.characterId, { ...look, ...patch });
  // Carried gear that could be worn: one per slot, so a set fills the figure instead of swapping helmets.
  const worn = new Set(Object.values(sheet.equipment).map((e) => e.item));
  const wearable: Wearable[] = [];
  for (const [item, v] of Object.entries(sheet.items)) {
    const slot = slotFor(item);
    if (slot && !worn.has(item)) wearable.push({ item, slot, rarity: v.rarity });
  }
  const putOn: PutOn = (xs) => atPid && wear(atPid, sheet.characterId, xs);

  return (
    <>
      <section className="doll" aria-label={`${name}'s calling card`}>
        <div className="doll-top">
          <h3>{name}</h3>
          {tag && <div className="ep">{tag}</div>}
        </div>
        <div className="doll-grid">
          <div className="scol">{left.map(tile)}</div>
          <div className="fig3d">
            <CharacterModel character={character} suggestedModel={suggested} look={look} features={features} style={style} highlight={hover} label={`${name}, wearing what the story has given them`} />
          </div>
          <div className="scol">{right.map(tile)}</div>
        </div>
        <div className="card-info">
          {character.description && <p>{character.description}</p>}
          {!!character.aliases.length && <div className="meta">Also called: {character.aliases.join(', ')}</div>}
          <div className="meta">
            {character.role ? `${character.role} · ` : ''}first seen {at(sheet.firstSeen)} · last seen {at(sheet.lastSeen)}
          </div>
          <div className="meta">
            Appearance v{sheet.appearance.version}
            {sheet.appearance.notes.length ? ` · ${sheet.appearance.notes.join(', ')}` : ''}{' '}
            <button className={`mini${character.lockedAppearance ? ' on' : ''}`} aria-pressed={!!character.lockedAppearance} onClick={() => toggleLock(sheet.characterId)}>
              {character.lockedAppearance ? 'Look locked' : 'Lock look'}
            </button>{' '}
            <button className={`mini${editing ? ' on' : ''}`} aria-expanded={editing} onClick={() => setEditing(!editing)}>Edit look</button>{' '}
            <button className={`mini${character.pinned ? ' on' : ''}`} aria-pressed={!!character.pinned} onClick={() => togglePin(sheet.characterId)}>
              {character.pinned ? 'Pinned' : 'Pin to tabs'}
            </button>
            {desktop()?.openStudio && (
              <>
                {' '}
                <button className="mini" title="Open this character in Questwright Studio, the Unreal character creator" onClick={() => void openStudio()}>Open in Studio</button>
              </>
            )}
          </div>
          {editing && (
            <div className="look">
              <label>Outfit<select value={look.outfit} onChange={(e) => set({ outfit: e.target.value as Outfit })}>{OUTFITS.map((o) => <option key={o}>{o}</option>)}</select></label>
              <label>Hair<select value={look.hair} onChange={(e) => set({ hair: e.target.value as HairStyle })}>{HAIR.map((o) => <option key={o}>{o}</option>)}</select></label>
              <label>Skin<input type="color" value={look.skin} onChange={(e) => set({ skin: e.target.value })} /></label>
              <label>Hair colour<input type="color" value={look.hairColor} onChange={(e) => set({ hairColor: e.target.value })} /></label>
              <label>Clothes<input type="color" value={look.cloth} onChange={(e) => set({ cloth: e.target.value })} /></label>
              <label>Accent<input type="color" value={look.accent} onChange={(e) => set({ accent: e.target.value })} /></label>
              <label>Height<input type="range" min={0.85} max={1.15} step={0.01} value={look.build} onChange={(e) => set({ build: Number(e.target.value) })} /></label>
            </div>
          )}
        </div>
      </section>
      {sheet.unconfirmed.length > 0 && (
        <p className="note unconfirmed-note">
          Values marked ? were carried in from books that were not fully read. Click a value to confirm or correct it.
        </p>
      )}
      {sheet.panels.filter((p) => p !== 'equipment').map((p) => (
        <Section key={p} id={`${sheet.characterId}:${p}`} title={TITLES[p]} count={count(sheet, p)}>
          {body(sheet, p, warnings.filter((w) => w.characterId === sheet.characterId), onJump, correct, wearable, putOn)}
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

type Correct = (kind: 'currency' | 'item', name: string, current: number) => void;
interface Wearable {
  item: string;
  slot: string;
  rarity?: Rarity;
}
type PutOn = (items: Wearable[]) => void;

function body(s: Sheet, p: PanelKey, warnings: ContinuityWarning[], onJump: (pid: string) => void, correct: Correct, wearable: Wearable[], putOn: PutOn): ReactNode {
  const unsure = (key: string) => s.unconfirmed.includes(key);
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
        <>
        {wearable.length > 0 && (
          <div className="wear" aria-label="Gear that can be worn">
            <span className="wear-h">Ready to wear</span>
            {wearable.map((w) => (
              <button key={w.item} className="mini" title={`Put ${w.item} on (${w.slot}) from this point in the story`} onClick={() => putOn([w])}>
                {w.item} <small>{w.slot}</small>
              </button>
            ))}
            {wearable.length > 1 && <button className="mini on" onClick={() => putOn(oneEach(wearable))}>Wear all</button>}
          </div>
        )}
        <div className="bag">
          {Object.entries(s.items).map(([n, v]) => (
            <button key={n} className={`cell${unsure(`item:${n}`) ? ' unsure' : ''}`} title={`${n}. Click to correct the count.`} onClick={() => correct('item', n, v.count)}>
              <span className="glyph" style={{ color: rar(v.rarity) }}>{initials(n)}</span>
              <span className="nm">{n}</span>
              <span className="qty">{unsure(`item:${n}`) ? '?' : ''}{v.count}</span>
            </button>
          ))}
          {!Object.keys(s.items).length && <p className="note">Empty for now.</p>}
        </div>
        </>
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
                <button className="val val-btn" title="Click to correct this value" onClick={() => correct('currency', n, v)}>
                  {unsure(`currency:${n}`) && <span className="unsure-badge">?</span>}
                  {v}
                </button>
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
      return null;
  }
}

/** The last-gained item for each slot, so wearing everything puts on the newest set. */
function oneEach(xs: Wearable[]): Wearable[] {
  return [...new Map(xs.map((w) => [w.slot, w])).values()];
}

function Section({ id, title, count, children }: { id: string; title: string; count?: string; children: ReactNode }) {
  const collapsed = useStudio((s) => s.collapsed.includes(id));
  const toggle = useStudio((s) => s.toggleCollapsed);
  const flash = useStudio((s) => s.flash.includes(id));
  return (
    <section className={`pnl${collapsed ? ' collapsed' : ''}${flash ? ' unlocked' : ''}`}>
      <button className="pnl-h" aria-expanded={!collapsed} onClick={() => toggle(id)}>
        {title}
        {count && <span className="cnt">{count}</span>}
        <span className="chev" aria-hidden="true">▾</span>
      </button>
      {!collapsed && <div className="pnl-b">{children}</div>}
    </section>
  );
}
