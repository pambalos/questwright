'use client';
/* eslint-disable @next/next/no-img-element -- card art is a local blob: URL */

import { cardable, draftCard, memoryCount, type CompendiumEntry, type GameCard, type WorldState } from '@questwright/engine';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PaintingPanel } from './Painting';
import { saveCardImage, writeCards } from '@/lib/cards';
import { iconKey, useImage } from '@/lib/illustrator';
import { useStudio } from '@/lib/store';

const RARITY_LABEL: Record<GameCard['rarity'], string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', unique: 'Unique' };

/** The card's art: the entry's icon, else its painting, else its initials. */
function useCardArt(entryKey: string) {
  const icon = useStudio((s) => s.project.illustrations?.[iconKey(entryKey)]?.approved);
  const painting = useStudio((s) => s.project.illustrations?.[entryKey]?.approved);
  return useImage(icon ?? painting);
}

/** A tabletop card: art, name banner, type line, stats, rules text and flavour, framed by kind and rarity. */
export function GameCardView({ entry, card, small, big }: { entry: CompendiumEntry; card: GameCard; small?: boolean; big?: boolean }) {
  const art = useCardArt(entry.key);
  // Shrink the text until it fits the box, as a printed card would be typeset.
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    setFit(1);
  }, [card, small]);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight > el.clientHeight + 1 && fit > 0.62) setFit((f) => Math.round((f - 0.06) * 100) / 100);
  }, [fit, card, small]);
  return (
    <div className={`gcard cat-${entry.category} r-${card.rarity}${small ? ' small' : ''}${big ? ' big' : ''}`} style={{ '--fit': fit } as React.CSSProperties}>
      <div className="gc-inner">
        <div className="gc-head">
          <b className="gc-title">{card.title}</b>
          {card.cost && <span className="gc-cost" title="Cost">{card.cost}</span>}
        </div>
        <div className="gc-art">{art ? <img src={art} alt="" /> : <span className="gc-ph">{card.title.split(/\s+/).map((w) => w[0]).join('').slice(0, 2)}</span>}</div>
        <div className="gc-type">
          <span>{card.typeLine}</span>
          <span className="gc-rarity" title={RARITY_LABEL[card.rarity]}>◆</span>
        </div>
        <div className="gc-box" ref={box}>
          {card.stats.length > 0 && (
            <div className="gc-stats">
              {card.stats.map((s) => (
                <span key={s.label}><small>{s.label}</small>{s.value}</span>
              ))}
            </div>
          )}
          <p className="gc-text">{card.text}</p>
          {card.flavor && (
            <p className="gc-flavor">
              {card.flavorBy ? `“${card.flavor.replace(/^["“]|["”]$/g, '')}”` : card.flavor}
              {card.flavorBy && <span> — {card.flavorBy}</span>}
            </p>
          )}
        </div>
        <div className="gc-foot">{RARITY_LABEL[card.rarity]}</div>
      </div>
    </div>
  );
}

/**
 * The middle of a codex page for a skill, spell, magic system or item: its
 * card, front and centre (a draft from the book's facts until Claude writes
 * one), with the card's buttons, and a switch to its painting when it has one.
 */
export function CardStage({ entry, state, figure }: { entry: CompendiumEntry; state: WorldState; figure: ReactNode }) {
  const card = useStudio((s) => s.project.cards?.[entry.key]);
  const hasPainting = useStudio((s) => Boolean(s.project.illustrations?.[entry.key]?.versions.length));
  const writing = useStudio((s) => s.writingCards.includes(entry.key));
  const aiStatus = useStudio((s) => s.aiStatus);
  const setCard = useStudio((s) => s.setCard);
  const [view, setView] = useState<'card' | 'painting'>('card');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const shown = card ?? draftCard(entry);
  const fresh = card ? memoryCount(entry) - card.from : 0;

  if (view === 'painting')
    return (
      <div className="card-stage">
        <PaintingPanel entry={entry} state={state} figure={figure} />
        <div className="pt-bar"><button className="mini" onClick={() => setView('card')}>Show card</button></div>
      </div>
    );
  return (
    <div className="card-stage">
      <div className="cs-table">
        <div ref={ref} className={writing ? 'cs-writing' : ''}>
          <GameCardView entry={entry} card={shown} big />
        </div>
      </div>
      <div className="pt-bar">
        {aiStatus === 'on' && (
          <button className="pt-paint" disabled={writing} onClick={() => void writeCards([entry.key])}>
            {writing ? 'Writing…' : card ? (fresh > 0 ? `Rewrite · ${fresh} new` : 'Rewrite card') : 'Make card'}
          </button>
        )}
        <button
          className="mini"
          disabled={saving}
          onClick={async () => {
            if (!ref.current) return;
            setSaving(true);
            try {
              await saveCardImage(ref.current.firstElementChild as HTMLElement, shown.title);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save image'}
        </button>
        {card && <button className="mini" onClick={() => setCard(entry.key, null)}>Remove</button>}
        <button className="mini" onClick={() => setView('painting')}>{hasPainting ? 'Show painting' : 'Painting'}</button>
      </div>
      {!card && <p className="cx-muted cs-note">Drafted from what the book says. Make card for one written by Claude.</p>}
    </div>
  );
}

/** Every card in a codex book, as a deck, with a button to write the missing ones. */
export function CardDeck({ entries, onOpen }: { entries: CompendiumEntry[]; onOpen(key: string): void }) {
  const cards = useStudio((s) => s.project.cards);
  const writing = useStudio((s) => s.writingCards);
  const aiStatus = useStudio((s) => s.aiStatus);
  const list = entries.filter(cardable);
  const missing = list.filter((e) => !cards?.[e.key] && !writing.includes(e.key));
  return (
    <div className="card-deck">
      <div className="cd-bar">
        <span>{list.length - missing.length} of {list.length} cards</span>
        {aiStatus === 'on' && missing.length > 0 && <button className="cx-tool" onClick={() => void writeCards(missing.map((e) => e.key))}>Make {missing.length} cards</button>}
        {writing.length > 0 && <span className="cx-muted">Writing {writing.length}…</span>}
      </div>
      <div className="cd-grid">
        {list.map((e) => {
          const c = cards?.[e.key];
          return (
            <button key={e.key} className="cd-slot" onClick={() => onOpen(e.key)} title={`Open ${e.name}`}>
              {c ? <GameCardView entry={e} card={c} small /> : <span className="cd-empty">{writing.includes(e.key) ? 'Writing…' : e.name}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
