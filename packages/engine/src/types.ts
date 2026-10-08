export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Paragraph {
  id: string;
  text: string;
}

export interface Chapter {
  id: string;
  title: string;
  /** Title of the book this chapter belongs to, for multi-book series. */
  book?: string;
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
  /** Appearance changes from the story no longer alter this character's figure. */
  lockedAppearance?: boolean;
  /** Look traits the author chose for the character figure. */
  look?: Look;
  /** Look traits the story describes, read by the AI; used where the author has not chosen. */
  lookHints?: Partial<Pick<Look, 'outfit' | 'hair' | 'hairColor' | 'cloth'>>;
  /** The author asked for a figure before the character earned a tab. */
  drawn?: boolean;
}

export type Outfit = 'tunic' | 'robe' | 'coat' | 'cloak' | 'armor';
export type HairStyle = 'short' | 'long' | 'spiky' | 'bald' | 'hood';

export interface Look {
  outfit: Outfit;
  hair: HairStyle;
  skin: string;
  hairColor: string;
  cloth: string;
  accent: string;
  /** Height relative to an average adult, 0.85 to 1.15. */
  build: number;
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
  | { kind: 'currency'; character: string; currency: string; delta: number; set?: number }
  | { kind: 'skill'; character: string; skill: string; level: number; replaces?: string }
  | { kind: 'item'; character: string; item: string; delta: number; set?: number; rarity?: Rarity }
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
  /**
   * Set by a limited series import: prose before this paragraph was never read,
   * so balances carried into it are shown as unconfirmed until the author sets them.
   */
  window?: { startParagraphId: string };
  /** Earlier books of a series, kept read-only outside the editor. Their system boxes are still tracked. */
  archive?: Manuscript;
  /** Chapters of archived books still waiting for a character skim. */
  skimPending?: string[];
  art?: { style: ArtStyle };
}

export type ArtStyle = 'painterly' | 'ink' | 'ember';


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
  appearance: { version: number; notes: string[] };
  /** "currency:Gold" or "item:Wolf Pelt" values carried into a limited import that the author has not confirmed. */
  unconfirmed: string[];
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
