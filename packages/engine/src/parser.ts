import { isSystemBox } from './manuscript';
import type { Change } from './types';

/**
 * Tier 1: reads bracketed system messages ("blue boxes") with fixed rules.
 * Free, instant and deterministic, so its changes apply without review.
 * Character fields in the output hold names; resolve them with `resolveDrafts`.
 */

export interface ParseContext {
  /** Name used when a system message does not say who it is about. */
  protagonist?: string;
}

export interface ParsedChange {
  change: Change;
  quote: string;
}

const STATS = 'STR|AGI|VIT|INT|WIS|DEX|END|CON|MANA|CHA|LUK|PER|HP|MP|SP';
const STAT_DELTA = new RegExp(`([+-]\\d+)\\s*(${STATS})\\b`, 'g');
const STAT_SET = new RegExp(`(?<![+-]\\d+\\s*)\\b(${STATS})\\s*:?\\s*(\\d+)\\b`, 'g');
const CURRENCY = /(^|[^\w])([+-]?\d[\d,]*)\s+(Gold|Silver|Copper|Platinum)\b/gi;

export const FREE_POINTS = 'Free points';
export const BLESSING_POINTS = 'Blessing Points';

/** Lines of a paragraph that count as system text. */
function systemLines(text: string): string[] {
  if (isSystemBox(text)) return text.split('\n').map((l) => l.trim()).filter(Boolean);
  return [...text.matchAll(/\[[^\]\n]+\]/g)].map((m) => m[0]);
}

export function parseParagraph(text: string, ctx: ParseContext = {}): ParsedChange[] {
  const lines = systemLines(text);
  if (!lines.length) return [];
  const out: ParsedChange[] = [];
  let boxSubject = ctx.protagonist;

  const welcome = /Welcome,\s*([A-Z][\w'-]*)/.exec(lines.join('\n'));
  if (welcome) boxSubject = welcome[1];

  for (const line of lines) {
    const push = (change: Change) => out.push({ change, quote: line });
    const prefix = /^\[?\s*([A-Z][\w'-]*(?: [A-Z][\w'-]*)?)\s*·/.exec(line);
    const lead = prefix?.[1];
    const startsWithRule = lead && /^(Level|Party|Status|Skill|Title|Class|Item|Equipped|Blessing)\b/.test(lead);
    const who = lead && !startsWithRule ? lead : boxSubject;

    const party = /Party formed:\s*([^\]\n]+)/i.exec(line);
    if (party) {
      for (const n of party[1]!.split(/[·,&]|\band\b/).map((s) => s.trim()).filter(Boolean)) push({ kind: 'mention', character: n });
      continue;
    }
    if (welcome && line.includes(welcome[0])) push({ kind: 'mention', character: welcome[1]! });
    if (!who) continue;

    const cls = /Class(?: assigned)?:\s*([A-Z][\w' -]*?)\s*(?=[.\]·,]|$)/.exec(line);
    if (cls) push({ kind: 'class', character: who, name: cls[1]! });

    const lvl = /\bLevel\s+(\d+)\b/i.exec(line);
    if (lvl) push({ kind: 'stat', character: who, stat: 'Level', set: Number(lvl[1]) });

    for (const m of line.matchAll(STAT_SET)) push({ kind: 'stat', character: who, stat: m[1]!, set: Number(m[2]) });
    for (const m of line.matchAll(STAT_DELTA)) push({ kind: 'stat', character: who, stat: m[2]!, delta: Number(m[1]) });

    const free = /(\d+)\s+free\s+(?:stat\s+)?points?/i.exec(line);
    if (free) push({ kind: 'stat', character: who, stat: FREE_POINTS, set: Number(free[1]) });

    const evolved = /Skill Evolved:\s*([^→\]]+?)\s*(?:→|->)\s*([^(\]]+?)\s*\(Lv\.?\s*(\d+)\)/i.exec(line);
    if (evolved) push({ kind: 'skill', character: who, skill: evolved[2]!.trim(), level: Number(evolved[3]), replaces: evolved[1]!.trim() });
    else
      for (const m of line.matchAll(/Skill(?: Acquired| Learned| Gained)?:\s*([^(\]\n·]+?)\s*\(Lv\.?\s*(\d+)\)/gi))
        push({ kind: 'skill', character: who, skill: m[1]!.trim(), level: Number(m[2]) });

    const title = /Title (?:Earned|Gained|Acquired|Unlocked):\s*([^\]\n]+)/i.exec(line);
    if (title) push({ kind: 'title', character: who, name: title[1]!.trim() });

    const item = /Item (?:Acquired|Obtained|Received|Looted):\s*([^\]\n]+?)(?:\s*[x×]\s*(\d+))?\s*(?:\]|$)/i.exec(line);
    if (item) push({ kind: 'item', character: who, item: item[1]!.trim(), delta: Number(item[2] ?? 1) });

    const equip = /Equipped:\s*([^\]\n(]+?)\s*\(([^)]+)\)/i.exec(line);
    if (equip) push({ kind: 'equip', character: who, item: equip[1]!.trim(), slot: equip[2]!.trim() });

    const blessing = /(Blessing of [^\]\n]+?)\s+(?:received|granted|bestowed)/i.exec(line);
    if (blessing) {
      const pts = /(\d+)\s+Blessing Points?/i.exec(lines.join('\n'));
      push({ kind: 'blessing', character: who, blessing: blessing[1]!.trim(), points: Number(pts?.[1] ?? 0) });
    } else if (!/Blessing Points?/i.test(line)) {
      const gained = /gained\s+(\d+)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Points?|Shards?|Coins?|Marks?))/.exec(line);
      if (gained) push({ kind: 'currency', character: who, currency: plural(gained[2]!), delta: Number(gained[1]) });
    } else if (!lines.some((l) => /Blessing of /i.test(l))) {
      const pts = /(\d+)\s+Blessing Points?/i.exec(line);
      if (pts) push({ kind: 'currency', character: who, currency: BLESSING_POINTS, delta: Number(pts[1]) });
    }

    for (const m of line.matchAll(CURRENCY)) {
      const n = Number(m[2]!.replace(/,/g, ''));
      push({ kind: 'currency', character: who, currency: cap(m[3]!), delta: n });
    }
  }
  return out;
}

function plural(s: string): string {
  return /s$/.test(s) ? s : `${s}s`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
