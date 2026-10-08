import { flatten, label, type PlacedParagraph } from './manuscript';
import { canonical } from './registry';
import type { ChangeRecord, CompendiumEntry, ContinuityWarning, LoreCategory, MagicSystem, Manuscript, PanelKey, Project, Registry, Sheet, WorldDefs, WorldState } from './types';

const PANEL_ORDER: PanelKey[] = ['stats', 'equipment', 'inventory', 'skills', 'currencies', 'blessings', 'titles'];

function emptySheet(characterId: string): Sheet {
  return {
    characterId,
    promoted: false,
    panels: [],
    stats: {},
    currencies: {},
    skills: [],
    magic: [],
    lore: [],
    items: {},
    equipment: {},
    titles: [],
    blessings: [],
    blessingPoints: 0,
    appearance: { version: 1, notes: [] },
    unconfirmed: [],
  };
}

const add = (list: string[], v: string) => {
  if (!list.includes(v)) list.push(v);
};

/** Applied records in manuscript order; records on paragraphs that no longer exist are skipped. */
export function orderedRecords(records: ChangeRecord[], paras: Map<string, PlacedParagraph>): ChangeRecord[] {
  return records
    .map((r, i) => ({ r, i, at: paras.get(r.paragraphId)?.index }))
    .filter((x): x is { r: ChangeRecord; i: number; at: number } => x.at !== undefined && x.r.status === 'applied')
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.r);
}

/**
 * Adds up every applied change from the start of the book to `upto` (a paragraph
 * index, inclusive). With no `upto` it covers the whole manuscript.
 */
export function fold(project: Project, manuscript: Manuscript, upto?: number): WorldState {
  const flat = flatten(manuscript);
  const paras = new Map(flat.map((p) => [p.id, p]));
  const end = Math.min(upto ?? flat.length - 1, flat.length - 1);
  const reg = project.characters;
  const sheets: Record<string, Sheet> = {};
  const world: WorldDefs = { currencies: [], stats: [], slots: [], skills: [], blessings: [], magic: [] };
  const warnings: ContinuityWarning[] = [];
  const sheet = (id: string) => (sheets[id] ??= emptySheet(id));
  const panels = new Map<string, Set<PanelKey>>();
  const unlock = (id: string, p: PanelKey) => {
    const s = sheet(id);
    s.promoted = true;
    let set = panels.get(id);
    if (!set) panels.set(id, (set = new Set()));
    set.add(p);
  };
  /** The character starts on a magic system: it gets its own panel, and the world learns the system exists. */
  const takeUp = (id: string, system: string, at: string) => {
    const s = sheet(id);
    s.promoted = true;
    if (!s.magic.some((m) => m.system === system)) s.magic.push({ system, at });
    tree(world, system);
  };
  const learn = (system: string, skill: string, requires: string | undefined, at: string, holder: string) => {
    const t = tree(world, system);
    let node = t.skills.find((k) => k.name === skill);
    if (!node) t.skills.push((node = { name: skill, at, holders: [] }));
    if (requires && !node.requires && requires !== skill) node.requires = requires;
    if (!node.holders.includes(holder)) node.holders.push(holder);
  };
  const entries = new Map<string, CompendiumEntry>();
  const entry = (key: string, name: string, category: LoreCategory, at: string, characterId?: string) => {
    let e = entries.get(key);
    if (!e) entries.set(key, (e = { key, name, category, firstAt: at, facts: [], ...(characterId ? { characterId } : {}) }));
    // A later, more specific reading of what something is wins over "other".
    if (e.category === 'other' && category !== 'other') e.category = category;
    return e;
  };
  const windowAt = project.window ? paras.get(project.window.startParagraphId)?.index : undefined;
  let carried: Set<string> | null = null;
  const carry = () => {
    // Everything a character holds when the read window opens came partly from unread prose.
    carried = new Set();
    for (const s of Object.values(sheets)) {
      for (const k of Object.keys(s.currencies)) carried.add(`${s.characterId}|currency:${k}`);
      for (const k of Object.keys(s.items)) carried.add(`${s.characterId}|item:${k}`);
    }
  };
  const seen = (id: string, at: number) => {
    const s = sheet(id);
    if (s.firstSeen === undefined || at < s.firstSeen) s.firstSeen = at;
    if (s.lastSeen === undefined || at > s.lastSeen) s.lastSeen = at;
  };

  for (const r of orderedRecords(project.records, paras)) {
    const p = paras.get(r.paragraphId)!;
    if (p.index > end) break;
    if (windowAt !== undefined && !carried && p.index >= windowAt) carry();
    const c = r.change;
    const warn = (characterId: string, kind: ContinuityWarning['kind'], message: string) =>
      warnings.push({ kind, characterId, paragraphId: p.id, message: `${message} (${label(p)})` });

    if (c.kind === 'merge') continue;
    if (c.kind === 'lore') {
      const fact = { fact: c.fact, at: p.id, recordId: r.id };
      const who = c.character ? canonical(reg, c.character) : undefined;
      if (who && reg[who]) {
        seen(who, p.index);
        sheet(who).lore.push(fact);
        entry(`char:${who}`, reg[who]!.name, 'character', p.id, who).facts.push(fact);
      } else {
        entry(`lore:${c.subject.trim().toLowerCase()}`, c.subject.trim(), c.category, p.id).facts.push(fact);
      }
      continue;
    }
    const id = canonical(reg, c.character);
    const s = sheet(id);
    seen(id, p.index);
    const name = reg[id]?.name ?? id;

    switch (c.kind) {
      case 'mention':
        break;
      case 'stat': {
        const before = s.stats[c.stat];
        const v = c.set ?? (before ?? 0) + (c.delta ?? 0);
        if (c.stat === 'Level' && before !== undefined && v < before) warn(id, 'level-down', `${name}'s level drops from ${before} to ${v}`);
        s.stats[c.stat] = v;
        add(world.stats, c.stat);
        unlock(id, 'stats');
        break;
      }
      case 'class':
        s.className = c.name;
        unlock(id, 'stats');
        break;
      case 'title':
        if (!s.titles.includes(c.name)) s.titles.push(c.name);
        unlock(id, 'titles');
        break;
      case 'currency': {
        const v = c.set ?? (s.currencies[c.currency] ?? 0) + c.delta;
        if (c.set !== undefined) (carried as Set<string> | null)?.delete(`${id}|currency:${c.currency}`);
        s.currencies[c.currency] = v;
        if (v < 0) warn(id, 'negative-currency', `${name}'s ${c.currency} goes below zero, to ${v}`);
        add(world.currencies, c.currency);
        unlock(id, 'currencies');
        break;
      }
      case 'skill': {
        const replaced = c.replaces ? s.skills.find((k) => k.name === c.replaces) : undefined;
        if (c.replaces) {
          if (!replaced) warn(id, 'unknown-skill', `${c.replaces} evolves, but ${name} never gained it`);
          s.skills = s.skills.filter((k) => k.name !== c.replaces);
        }
        // Which magic system the skill is part of: the author's word, then the story's, then what an
        // evolved skill was part of, then where the world has already seen this skill.
        const path = project.skillPaths?.[c.skill];
        const raw = path ? path.system ?? undefined : c.system ?? replaced?.system ?? systemOf(world, c.skill);
        const system = raw ? systemName(world, raw) : undefined;
        const requires = path?.requires ?? c.requires ?? c.replaces;
        const existing = s.skills.find((k) => k.name === c.skill);
        if (existing) {
          existing.level = c.level;
          if (system) existing.system = system;
        } else {
          s.skills.push({ name: c.skill, level: c.level, at: p.id, ...(c.replaces ? { evolvedFrom: c.replaces } : {}), ...(system ? { system } : {}), ...(requires ? { requires } : {}) });
        }
        add(world.skills, c.skill);
        if (system) {
          takeUp(id, system, p.id);
          learn(system, c.skill, requires, p.id, id);
        } else unlock(id, 'skills');
        break;
      }
      case 'magic':
        takeUp(id, systemName(world, c.system), p.id);
        break;
      case 'item': {
        const v = c.set ?? (s.items[c.item]?.count ?? 0) + c.delta;
        if (c.set !== undefined) (carried as Set<string> | null)?.delete(`${id}|item:${c.item}`);
        if (v < 0) warn(id, 'negative-item', `${name} gives up more ${c.item} than they have`);
        if (v > 0) s.items[c.item] = { count: v, rarity: c.rarity ?? s.items[c.item]?.rarity };
        else delete s.items[c.item];
        unlock(id, 'inventory');
        break;
      }
      case 'equip':
        s.equipment[c.slot] = { item: c.item, rarity: c.rarity };
        add(world.slots, c.slot);
        unlock(id, 'equipment');
        break;
      case 'unequip':
        delete s.equipment[c.slot];
        break;
      case 'blessing':
        if (!s.blessings.includes(c.blessing)) s.blessings.push(c.blessing);
        s.blessingPoints += c.points;
        add(world.blessings, c.blessing);
        unlock(id, 'blessings');
        break;
      case 'appearance':
        if (reg[id]?.lockedAppearance) break;
        s.appearance = { version: s.appearance.version + 1, notes: [...s.appearance.notes, c.note] };
        break;
    }
  }

  if (windowAt !== undefined && !carried && end >= windowAt) carry();
  // A name in the text also counts as an appearance, so cards show when someone was first and last seen.
  const mentions = mentionIndex(manuscript, reg);
  for (const c of Object.values(reg)) {
    if (c.mergedInto) continue;
    const hits = mentions.get(c.id);
    if (c.pinned) sheet(c.id).promoted = true;
    if (!hits?.length || hits[0]! > end) continue;
    seen(c.id, hits[0]!);
    seen(c.id, hits[lastAtOrBefore(hits, end)]!);
  }
  for (const key of (carried as Set<string> | null) ?? []) {
    const [id, value] = key.split('|') as [string, string];
    const s = sheets[id];
    const [kind, name] = value.split(/:(.*)/s) as [string, string];
    const still = kind === 'currency' ? name in (s?.currencies ?? {}) : name in (s?.items ?? {});
    if (s && still) s.unconfirmed.push(value);
  }
  for (const [id, set] of panels) sheet(id).panels = PANEL_ORDER.filter((k) => set.has(k));
  for (const id of Object.keys(sheets)) if (reg[id]?.mergedInto || sheets[id]!.firstSeen === undefined) delete sheets[id];

  // Every character seen so far has an entry, even before the story says much about them.
  for (const s of Object.values(sheets)) {
    const c = reg[s.characterId];
    const first = flat[s.firstSeen!];
    if (c && first) {
      const e = entry(`char:${c.id}`, c.name, 'character', first.id, c.id);
      e.name = c.name;
      if ((paras.get(e.firstAt)?.index ?? Infinity) > first.index) e.firstAt = first.id;
    }
  }
  const compendium = [...entries.values()].sort((a, b) => (paras.get(a.firstAt)?.index ?? 0) - (paras.get(b.firstAt)?.index ?? 0));

  return { position: end, sheets, world, warnings, compendium };
}

/** A known magic system's own spelling of a name, so "qi cultivation" and "Qi Cultivation" are one system. */
function systemName(world: WorldDefs, name: string): string {
  const n = name.trim();
  return world.magic.find((m) => m.name.toLowerCase() === n.toLowerCase())?.name ?? n;
}

function systemOf(world: WorldDefs, skill: string): string | undefined {
  return world.magic.find((m) => m.skills.some((k) => k.name === skill))?.name;
}

function tree(world: WorldDefs, system: string): MagicSystem {
  let t = world.magic.find((m) => m.name === system);
  if (!t) world.magic.push((t = { name: system, skills: [] }));
  return t;
}

function lastAtOrBefore(sorted: number[], end: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sorted[mid]! <= end) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const mentionCache = new WeakMap<Manuscript, Map<string, Map<string, number[]>>>();
const textMatches = new Map<string, Map<string, string[]>>();

/**
 * Paragraph indices where each character's name or an alias appears. One pass over
 * the book with a single pattern, cached per manuscript and set of names, so folding a
 * long series stays fast.
 */
export function mentionIndex(m: Manuscript, reg: Registry): Map<string, number[]> {
  const owners = new Map<string, string[]>();
  for (const c of Object.values(reg)) {
    const target = canonical(reg, c.id);
    for (const n of [c.name, ...c.aliases]) {
      const key = n.trim().toLowerCase();
      if (key.length < 3) continue;
      owners.set(key, [...(owners.get(key) ?? []), target]);
    }
  }
  const sig = [...owners.entries()].map(([k, v]) => `${k}=${v.join(',')}`).sort().join('|');
  let perBook = mentionCache.get(m);
  if (!perBook) mentionCache.set(m, (perBook = new Map()));
  const hit = perBook.get(sig);
  if (hit) return hit;

  const out = new Map<string, number[]>();
  if (owners.size) {
    const esc = [...owners.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${esc.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    // Paragraph texts repeat across edits of the same book, so remember what each one names.
    let byText = textMatches.get(sig);
    if (!byText) {
      if (textMatches.size > 8) textMatches.clear();
      textMatches.set(sig, (byText = new Map()));
    }
    for (const p of flatten(m)) {
      let found = byText.get(p.text);
      if (!found) byText.set(p.text, (found = [...new Set([...p.text.matchAll(re)].map((x) => x[1]!.toLowerCase()))]));
      for (const name of found) {
        for (const id of owners.get(name) ?? []) {
          const list = out.get(id) ?? [];
          if (list[list.length - 1] !== p.index) list.push(p.index);
          out.set(id, list);
        }
      }
    }
  }
  perBook.set(sig, out);
  return out;
}
