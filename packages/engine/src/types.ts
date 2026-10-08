export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Paragraph {
  id: string;
  text: string;
}

export interface Chapter {
  id: string;
  title: string;
  paragraphs: Paragraph[];
}

export interface Manuscript {
  chapters: Chapter[];
}

export interface Character {
  id: string;
  name: string;
  aliases: string[];
  role?: string;
  description?: string;
  /** Author pinned this character to a tab before any game-mechanic event. */
  pinned?: boolean;
  /** Set when the author confirmed this character is the same person as another. */
  mergedInto?: string;
}

export type Registry = Record<string, Character>;

/**
 * One thing the story did to a character. Character fields hold character ids
 * once resolved; parser and AI output carry names until `resolveDrafts` maps them.
 */
export type Change =
  | { kind: 'mention'; character: string }
  | { kind: 'stat'; character: string; stat: string; set?: number; delta?: number }
  | { kind: 'class'; character: string; name: string }
  | { kind: 'title'; character: string; name: string }
  | { kind: 'currency'; character: string; currency: string; delta: number }
  | { kind: 'skill'; character: string; skill: string; level: number; replaces?: string }
  | { kind: 'item'; character: string; item: string; delta: number; rarity?: Rarity }
  | { kind: 'equip'; character: string; slot: string; item: string; rarity?: Rarity }
  | { kind: 'unequip'; character: string; slot: string }
  | { kind: 'blessing'; character: string; blessing: string; points: number }
  | { kind: 'appearance'; character: string; note: string }
  | { kind: 'merge'; from: string; into: string };

export type ChangeKind = Change['kind'];

/** Where a change came from. Parser changes apply on their own; AI changes wait for the author. */
export type Source = 'parser' | 'ai' | 'author';
export type Status = 'applied' | 'proposed' | 'dismissed';

export interface ChangeRecord {
  id: string;
  paragraphId: string;
  /** Hash of the paragraph text the change was read from. */
  textHash: string;
  source: Source;
  status: Status;
  change: Change;
  /** The words in the paragraph that support the change. */
  quote?: string;
}

export interface Project {
  id: string;
  title: string;
  /** Character that bracketed system messages refer to when they name no one. */
  protagonistId?: string;
  characters: Registry;
  records: ChangeRecord[];
  /** Text hash of each paragraph the last time the system-box parser read it. */
  parsed: Record<string, string>;
  /** Text hash of each paragraph the last time AI extraction ran on it. */
  extracted: Record<string, string>;
}

export type PanelKey = 'stats' | 'equipment' | 'inventory' | 'skills' | 'currencies' | 'blessings' | 'titles';

export interface Sheet {
  characterId: string;
  firstSeen?: number;
  lastSeen?: number;
  promoted: boolean;
  panels: PanelKey[];
  className?: string;
  stats: Record<string, number>;
  currencies: Record<string, number>;
  skills: { name: string; level: number; evolvedFrom?: string }[];
  items: Record<string, { count: number; rarity?: Rarity }>;
  equipment: Record<string, { item: string; rarity?: Rarity }>;
  titles: string[];
  blessings: string[];
  blessingPoints: number;
  appearance: { version: number; note?: string };
}

export interface WorldDefs {
  currencies: string[];
  stats: string[];
  slots: string[];
  skills: string[];
  blessings: string[];
}

export type WarningKind = 'negative-currency' | 'negative-item' | 'unknown-skill' | 'level-down';

export interface ContinuityWarning {
  kind: WarningKind;
  paragraphId: string;
  characterId: string;
  message: string;
}

export interface WorldState {
  /** Index of the last paragraph included, in manuscript order. -1 for an empty book. */
  position: number;
  sheets: Record<string, Sheet>;
  world: WorldDefs;
  warnings: ContinuityWarning[];
}
