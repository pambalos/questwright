import type { Change, Character, Registry } from './types';

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'character';
}

/** Follows merges to the character a record should count towards. */
export function canonical(reg: Registry, id: string): string {
  const seen = new Set<string>();
  let cur = id;
  while (reg[cur]?.mergedInto && !seen.has(cur)) {
    seen.add(cur);
    cur = reg[cur]!.mergedInto!;
  }
  return cur;
}

/** Finds a character by name or alias, ignoring case and a leading "the". */
export function findByName(reg: Registry, name: string): Character | undefined {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, '');
  const n = norm(name);
  if (!n) return undefined;
  const all = Object.values(reg);
  return (
    all.find((c) => norm(c.name) === n && !c.mergedInto) ??
    all.find((c) => norm(c.name) === n) ??
    all.find((c) => c.aliases.some((a) => norm(a) === n))
  );
}

export function addCharacter(reg: Registry, name: string, extra: Partial<Character> = {}): Character {
  let id = slug(name);
  for (let i = 2; reg[id]; i++) id = `${slug(name)}-${i}`;
  const c: Character = { id, name: name.trim(), aliases: [], ...extra };
  reg[id] = c;
  return c;
}

/**
 * Maps the names in draft changes to character ids, adding characters the
 * registry has not seen. Mutates and returns `reg`.
 */
export function resolveDrafts(reg: Registry, drafts: Change[]): { changes: Change[]; registry: Registry; created: string[] } {
  const created: string[] = [];
  const idFor = (name: string) => {
    const hit = findByName(reg, name);
    if (hit) return hit.id;
    const c = addCharacter(reg, name);
    created.push(c.id);
    return c.id;
  };
  const changes = drafts.map((d): Change => {
    if (d.kind === 'merge') return { ...d, from: idFor(d.from), into: idFor(d.into) };
    return { ...d, character: idFor(d.character) };
  });
  return { changes, registry: reg, created };
}

/** Applies an accepted merge: `from` becomes an alias of `into`. */
export function applyMerge(reg: Registry, from: string, into: string): void {
  const a = reg[from];
  const b = reg[into];
  if (!a || !b || from === into) return;
  a.mergedInto = into;
  const aliases = new Set([...b.aliases, a.name.toLowerCase(), ...a.aliases]);
  aliases.delete(b.name.toLowerCase());
  b.aliases = [...aliases];
}
