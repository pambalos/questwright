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
  for (const s of Object.values(state.sheets)) {
    if (!s.promoted) continue;
    tabs.push(s.characterId);
    for (const p of s.panels) panels.push(`${s.characterId}:${p}`);
  }
  return {
    tabs,
    panels,
    slots: [...state.world.slots],
    codex: [...state.world.currencies, ...state.world.blessings],
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
    const [id, p] = pk.split(':') as [string, string];
    if (!fresh(prev.tabs, next.tabs).includes(id) || p !== 'stats') out.push({ kind: 'unlock', head: 'New panel unlocked', body: `${name(id)} · ${PANEL_NAMES[p] ?? p}` });
  }
  for (const s of fresh(prev.slots, next.slots)) out.push({ kind: 'unlock', head: 'New equipment slot', body: s });
  for (const c of fresh(prev.codex, next.codex)) out.push({ kind: 'unlock', head: 'Codex entry discovered', body: c });
  for (const w of fresh(prev.warnings, next.warnings)) {
    const hit = state.warnings.find((x) => `${x.paragraphId}:${x.characterId}:${x.kind}` === w);
    if (hit) out.push({ kind: 'warn', head: 'Continuity check', body: hit.message });
  }
  return out;
}
