'use client';

import { describeChange, label, type PlacedParagraph, type WorldState } from '@questwright/engine';
import { useEffect } from 'react';
import { Figure2D } from '@/figure/Figure2D';
import { gearFor } from '@/figure/gear';
import { lookOf } from '@/figure/look';
import { useStudio } from '@/lib/store';
import { CharacterSheet } from './CharacterSheet';
import { Roster } from './Roster';
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

  const tabs = Object.values(latest.sheets).filter((s) => s.promoted);
  const at = flat[viewIndex];
  const sheet = view.sheets[tab];

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
        <button role="tab" aria-selected={tab === 'world'} className={`tab${tab === 'world' ? ' on' : ''}`} onClick={() => setTab('world')}>
          World
        </button>
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
        ) : tab === 'world' ? (
          <WorldTab world={view.world} flat={flat} onJump={jump} />
        ) : sheet?.promoted ? (
          <CharacterSheet sheet={sheet} world={view.world} warnings={view.warnings} flat={flat} atPid={at?.id ?? null} onJump={jump} />
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
        const who = c.kind === 'merge' ? 'Roster' : name(c.character);
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
