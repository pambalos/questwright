'use client';

import { describeChange, label, type PlacedParagraph, type WorldState } from '@questwright/engine';
import { useEffect } from 'react';
import { Figure2D } from '@/figure/Figure2D';
import { gearFor } from '@/figure/gear';
import { lookOf } from '@/figure/look';
import { useStudio } from '@/lib/store';
import { CharacterSheet } from './CharacterSheet';
import { Compendium } from './Compendium';
import { Roster } from './Roster';
import { Story } from './Story';
import { WorldTab } from './WorldTab';

interface Props {
  view: WorldState;
  latest: WorldState;
  flat: PlacedParagraph[];
  viewIndex: number;
}

export function Panel({ view, latest, flat, viewIndex }: Props) {
  const tab = useStudio((s) => s.tab);
  const setTab = useStudio((s) => s.setTab);
  const characters = useStudio((s) => s.project.characters);
  const style = useStudio((s) => s.project.art?.style ?? 'painterly');
  const protagonistId = useStudio((s) => s.project.protagonistId);
  const scrub = useStudio((s) => s.scrub);
  const setScrub = useStudio((s) => s.setScrub);
  const jump = useStudio((s) => s.jump);
  const mode = useStudio((s) => s.panelMode);
  const setMode = useStudio((s) => s.setPanelMode);

  const tabs = Object.values(latest.sheets).filter((s) => s.promoted);
  const at = flat[viewIndex];
  const sheet = view.sheets[tab];

  if (mode === 'mini') return <MiniBar tabs={tabs.map((s) => s.characterId)} latest={latest} />;

  return (
    <aside className="hud" aria-label="Character panel">
      <div className="tabs" role="tablist">
        {tabs.map((s) => {
          const c = characters[s.characterId];
          const name = c?.name ?? s.characterId;
          return (
            <button key={s.characterId} role="tab" aria-selected={tab === s.characterId} className={`tab${tab === s.characterId ? ' on' : ''}`} onClick={() => setTab(s.characterId)}>
              {c ? <Figure2D crop look={lookOf(c, protagonistId)} features={gearFor(s)} style={style} label="" /> : null}
              {name}
            </button>
          );
        })}
        <button role="tab" aria-selected={tab === 'roster'} className={`tab${tab === 'roster' ? ' on' : ''}`} onClick={() => setTab('roster')}>
          Roster <span className="n">{Object.keys(latest.sheets).length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'compendium'} className={`tab${tab === 'compendium' ? ' on' : ''}`} onClick={() => setTab('compendium')}>
          Compendium <span className="n">{latest.compendium.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'world'} className={`tab${tab === 'world' ? ' on' : ''}`} onClick={() => setTab('world')}>
          World
        </button>
        <button role="tab" aria-selected={tab === 'story'} className={`tab${tab === 'story' ? ' on' : ''}`} onClick={() => setTab('story')} title="The story so far: chapter summaries, plot threads and events">
          Story
        </button>
        <div className="panel-modes" role="group" aria-label="Panel size">
          <button className="mode-btn" title="Minimise to icons (Ctrl+\)" aria-label="Minimise the panel" onClick={() => setMode('mini')}>
            <Icon name="minimise" />
          </button>
          {mode === 'full' ? (
            <button className="mode-btn" title="Back beside the editor (Esc)" aria-label="Exit full screen" onClick={() => setMode('open')}>
              <Icon name="restore" />
            </button>
          ) : (
            <button className="mode-btn" title="Full screen" aria-label="Show the panel full screen" onClick={() => setMode('full')}>
              <Icon name="full" />
            </button>
          )}
        </div>
      </div>
      {scrub !== null && at && (
        <div className="view-banner">
          Viewing the story as of {label(at)}
          <button onClick={() => setScrub(null)}>Back to cursor</button>
        </div>
      )}
      <div className="hud-body">
        <LootTray flat={flat} />
        {tab === 'roster' ? (
          <Roster view={view} flat={flat} />
        ) : tab === 'compendium' ? (
          <Compendium state={view} flat={flat} onJump={jump} />
        ) : tab === 'world' ? (
          <WorldTab world={view.world} flat={flat} onJump={jump} />
        ) : tab === 'story' ? (
          <Story latest={latest} flat={flat} viewIndex={viewIndex} onJump={jump} />
        ) : sheet?.promoted ? (
          <CharacterSheet sheet={sheet} world={view.world} compendium={view.compendium} warnings={view.warnings} flat={flat} atPid={at?.id ?? null} onJump={jump} />
        ) : (
          <div className="empty-tab">
            {characters[tab]?.name ?? 'This character'} has no sheet yet{at ? ` at ${label(at)}` : ''}.
            <br />
            <br />
            <button className="mini" onClick={() => setTab('roster')}>Open the roster</button>
          </div>
        )}
      </div>
      <div className="scrub">
        <span>Ch 1</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, flat.length - 1)}
          value={Math.max(0, viewIndex)}
          aria-label="Timeline position"
          onChange={(e) => {
            const i = Number(e.target.value);
            setScrub(i);
            const pid = flat[i]?.id;
            if (pid) jump(pid);
          }}
        />
        <b>{at ? label(at) : '—'}</b>
      </div>
      <Toasts />
    </aside>
  );
}

function LootTray({ flat }: { flat: PlacedParagraph[] }) {
  const project = useStudio((s) => s.project);
  const claim = useStudio((s) => s.claim);
  const dismiss = useStudio((s) => s.dismiss);
  const claimAll = useStudio((s) => s.claimAll);
  const jump = useStudio((s) => s.jump);
  const order = new Map(flat.map((p) => [p.id, p]));
  const pending = project.records
    .filter((r) => r.status === 'proposed' && order.has(r.paragraphId))
    .sort((a, b) => order.get(a.paragraphId)!.index - order.get(b.paragraphId)!.index);
  if (!pending.length) return null;
  const name = (id: string) => project.characters[id]?.name ?? id;
  const gem = (kind: string, rarity?: string) =>
    kind === 'merge' || kind === 'appearance' ? 'var(--r-epic)' : `var(--r-${rarity ?? (kind === 'currency' ? 'uncommon' : 'common')})`;

  return (
    <section className="loot" aria-label="Loot found">
      <div className="loot-h">
        Loot found · {pending.length}
        <button onClick={claimAll}>Claim all</button>
      </div>
      {pending.map((r) => {
        const c = r.change;
        const who = c.kind === 'merge' ? 'Roster' : c.kind === 'lore' || c.kind === 'relation' ? 'Compendium' : name(c.character);
        const rarity = 'rarity' in c ? c.rarity : undefined;
        const p = order.get(r.paragraphId)!;
        return (
          <div className="drop" key={r.id}>
            <span className="gem" style={{ background: gem(c.kind, rarity) }} />
            <span>
              {who} · {describeChange(c, name)}
              <button className="src" onClick={() => jump(r.paragraphId)} title={r.quote}>from {label(p)}</button>
            </span>
            <span className="acts">
              <button className="claim" onClick={() => claim(r.id)}>Claim</button>
              <button onClick={() => dismiss(r.id)} aria-label="Dismiss">✕</button>
            </span>
          </div>
        );
      })}
    </section>
  );
}

const ICONS = {
  minimise: 'M9 6l6 6-6 6',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  restore: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  expand: 'M15 6l-6 6 6 6',
  roster: 'M8 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a3 3 0 100-6M18 14c2.4.7 4 3 4 6',
  compendium: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11M9 8h6',
  story: 'M4 5c3-1 5.5-1 8 1 2.5-2 5-2 8-1v14c-3-1-5.5-1-8 1-2.5-2-5-2-8-1zM12 6v14',
  world: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The panel folded into a slim bar: one icon per tab, and a count of finds waiting to be claimed. */
function MiniBar({ tabs, latest }: { tabs: string[]; latest: WorldState }) {
  const tab = useStudio((s) => s.tab);
  const setTab = useStudio((s) => s.setTab);
  const setMode = useStudio((s) => s.setPanelMode);
  const characters = useStudio((s) => s.project.characters);
  const records = useStudio((s) => s.project.records);
  const style = useStudio((s) => s.project.art?.style ?? 'painterly');
  const protagonistId = useStudio((s) => s.project.protagonistId);
  const pending = records.filter((r) => r.status === 'proposed').length;
  const open = (t: string) => {
    setTab(t);
    setMode('open');
  };
  const button = (t: string, title: string, body: React.ReactNode) => (
    <button key={t} className={`mini-btn${tab === t ? ' on' : ''}`} title={title} aria-label={title} aria-pressed={tab === t} onClick={() => open(t)}>
      {body}
    </button>
  );
  return (
    <aside className="hud mini" aria-label="Character panel, minimised">
      <button className="mini-btn" title="Expand the panel (Ctrl+\)" aria-label="Expand the panel" onClick={() => setMode('open')}>
        <Icon name="expand" />
      </button>
      {pending > 0 && (
        <button className="mini-btn loot" title={`${pending} ${pending === 1 ? 'find' : 'finds'} to claim`} aria-label={`${pending} finds to claim`} onClick={() => setMode('open')}>
          {pending > 99 ? '99+' : pending}
        </button>
      )}
      <div className="mini-list">
        {tabs.map((id) => {
          const c = characters[id];
          const s = latest.sheets[id];
          return button(id, c?.name ?? id, c && s ? <Figure2D crop look={lookOf(c, protagonistId)} features={gearFor(s)} style={style} label="" /> : (c?.name ?? id).slice(0, 2));
        })}
      </div>
      <div className="mini-foot">
        {button('roster', 'Roster', <Icon name="roster" />)}
        {button('compendium', `Compendium · ${latest.compendium.length}`, <Icon name="compendium" />)}
        {button('world', 'World', <Icon name="world" />)}
        {button('story', 'Story', <Icon name="story" />)}
      </div>
      <Toasts />
    </aside>
  );
}

function Toasts() {
  const toasts = useStudio((s) => s.toasts);
  const drop = useStudio((s) => s.dropToast);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => drop(toasts[0]!.id), 4200);
    return () => clearTimeout(t);
  }, [toasts, drop]);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.slice(-4).map((t) => (
        <button key={t.id} className={`toast ${t.kind}`} onClick={() => drop(t.id)}>
          <small>{t.head}</small>
          {t.body}
        </button>
      ))}
    </div>
  );
}
