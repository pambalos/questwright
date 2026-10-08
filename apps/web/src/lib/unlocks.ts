import type { Project, WorldState } from '@questwright/engine';

export type ToastKind = 'unlock' | 'sys' | 'warn' | 'ach' | 'error';
export interface Toast {
  id: number;
  kind: ToastKind;
  head: string;
  body: string;
}

export interface Snapshot {
  tabs: string[];
  panels: string[];
  slots: string[];
  codex: string[];
  /** "characterId|system|skill" for every skill on a magic system's tree. */
  talents: string[];
  /** "category|name" for compendium entries other than characters (they get tabs instead). */
  compendium: string[];
  warnings: string[];
}

const PANEL_NAMES: Record<string, string> = {
  stats: 'Stats',
  equipment: 'Equipment',
  inventory: 'Inventory',
  skills: 'Skills',
  currencies: 'Currencies',
  blessings: 'Blessings',
  titles: 'Titles',
};

export function snapshot(state: WorldState): Snapshot {
  const tabs: string[] = [];
  const panels: string[] = [];
  const talents: string[] = [];
  for (const s of Object.values(state.sheets)) {
    if (!s.promoted) continue;
    tabs.push(s.characterId);
    for (const p of s.panels) panels.push(`${s.characterId}:${p}`);
    // Each magic system is a panel of its own, keyed like the sheet's sections.
    for (const m of s.magic) panels.push(`${s.characterId}:magic:${m.system}`);
    for (const k of s.skills) if (k.system) talents.push(`${s.characterId}|${k.system}|${k.name}`);
  }
  return {
    tabs,
    panels,
    slots: [...state.world.slots],
    codex: [...state.world.currencies, ...state.world.blessings, ...state.world.magic.map((m) => m.name)],
    talents,
    compendium: state.compendium.filter((e) => e.category !== 'character').map((e) => `${e.category}|${e.name}`),
    warnings: state.warnings.map((w) => `${w.paragraphId}:${w.characterId}:${w.kind}`),
  };
}

/** What became newly visible between two snapshots, as toast messages. */
export function unlockToasts(prev: Snapshot, next: Snapshot, project: Project, state: WorldState): Omit<Toast, 'id'>[] {
  const name = (id: string) => project.characters[id]?.name ?? id;
  const fresh = (a: string[], b: string[]) => b.filter((x) => !a.includes(x));
  const out: Omit<Toast, 'id'>[] = [];
  for (const id of fresh(prev.tabs, next.tabs)) out.push({ kind: 'unlock', head: 'New character tab', body: name(id) });
  for (const pk of fresh(prev.panels, next.panels)) {
    const [id, p, ...rest] = pk.split(':') as [string, string, ...string[]];
    if (p === 'magic') {
      out.push({ kind: 'unlock', head: 'New path unlocked', body: `${name(id)} · ${rest.join(':')}` });
      continue;
    }
    if (!fresh(prev.tabs, next.tabs).includes(id) || p !== 'stats') out.push({ kind: 'unlock', head: 'New panel unlocked', body: `${name(id)} · ${PANEL_NAMES[p] ?? p}` });
  }
  for (const t of fresh(prev.talents ?? [], next.talents)) {
    const [id, system, skill] = t.split('|') as [string, string, string];
    out.push({ kind: 'unlock', head: `Talent learned · ${system}`, body: `${name(id)} · ${skill}` });
  }
  for (const e of fresh(prev.compendium ?? [], next.compendium)) {
    const [category, entry] = e.split('|') as [string, string];
    out.push({ kind: 'unlock', head: category === 'creature' ? 'Bestiary entry discovered' : 'Compendium entry discovered', body: entry });
  }
  for (const s of fresh(prev.slots, next.slots)) out.push({ kind: 'unlock', head: 'New equipment slot', body: s });
  for (const c of fresh(prev.codex, next.codex)) out.push({ kind: 'unlock', head: 'Codex entry discovered', body: c });
  for (const w of fresh(prev.warnings, next.warnings)) {
    const hit = state.warnings.find((x) => `${x.paragraphId}:${x.characterId}:${x.kind}` === w);
    if (hit) out.push({ kind: 'warn', head: 'Continuity check', body: hit.message });
  }
  return out;
}
