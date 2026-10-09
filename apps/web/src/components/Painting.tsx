'use client';
/* eslint-disable @next/next/no-img-element -- paintings are local blob: URLs, which next/image cannot optimise */

import type { CompendiumEntry, WorldState } from '@questwright/engine';
import { useState, type ReactNode } from 'react';
import { PROVIDERS } from '@/lib/image-providers';
import { illustrate, stale, useImage } from '@/lib/illustrator';
import { useStudio } from '@/lib/store';

const NONE: string[] = [];

/** The approved painting of an entry as an <img>, or `fallback` when it has none. */
export function Painted({ entryKey, fallback, className }: { entryKey: string; fallback: ReactNode; className?: string }) {
  const id = useStudio((s) => s.project.illustrations?.[entryKey]?.approved);
  const url = useImage(id);
  return url ? <img className={className ?? 'painted'} src={url} alt="" /> : <>{fallback}</>;
}

/** A small painted portrait over a character's 3D figure; opens their codex page. */
export function PortraitInset({ characterId, name }: { characterId: string; name: string }) {
  const key = `char:${characterId}`;
  const id = useStudio((s) => s.project.illustrations?.[key]?.approved);
  const openCodex = useStudio((s) => s.setCodexOpen);
  const url = useImage(id);
  const painting = useStudio((s) => s.painting.includes(key));
  const provider = useStudio((s) => PROVIDERS[s.images.provider]);
  const hasKey = useStudio((s) => s.imageKeys[s.images.provider]);
  if (!url)
    return (
      <button
        className="paint-inset"
        disabled={painting || !hasKey}
        title={hasKey ? `Paint ${name} with ${provider.label}` : `Add a ${provider.company} key in Settings to paint`}
        onClick={() => void illustrate(key)}
      >
        {painting ? 'Painting…' : 'Illustrate'}
      </button>
    );
  return (
    <button className="portrait-inset" title={`${name}'s painting: open in the codex`} onClick={() => openCodex(key)}>
      <img src={url} alt={`Painting of ${name}`} />
      {painting && <span className="inset-busy">Painting…</span>}
    </button>
  );
}

function Thumb({ id, on, approved, onClick }: { id: string; on: boolean; approved: boolean; onClick(): void }) {
  const url = useImage(id);
  return (
    <button className={`pt-thumb${on ? ' on' : ''}`} aria-pressed={on} title={approved ? 'Approved version' : 'Show this version'} onClick={onClick}>
      {url ? <img src={url} alt="" /> : <span className="ph" />}
      {approved && <i aria-hidden="true">★</i>}
    </button>
  );
}

/**
 * The codex portrait as a painting: the approved version (or one picked from
 * the gallery), a button to paint it, and what to do with each version.
 * `figure` is shown while there is no painting.
 */
export function PaintingPanel({ entry, state, figure }: { entry: CompendiumEntry; state: WorldState; figure: ReactNode }) {
  const set = useStudio((s) => s.project.illustrations?.[entry.key]);
  const project = useStudio((s) => s.project);
  const styleRefs = useStudio((s) => s.project.styleRefs) ?? NONE;
  const painting = useStudio((s) => s.painting.includes(entry.key));
  const images = useStudio((s) => s.images);
  const hasKey = useStudio((s) => s.imageKeys[s.images.provider]);
  const approve = useStudio((s) => s.approveIllustration);
  const remove = useStudio((s) => s.deleteIllustration);
  const toggleStyle = useStudio((s) => s.toggleStyleRef);
  const [picked, setPicked] = useState<string | null>(null);
  const [showFigure, setShowFigure] = useState(false);

  const versions = set?.versions ?? [];
  const shown = versions.find((v) => v.id === picked) ?? versions.find((v) => v.id === set?.approved) ?? versions.at(-1);
  const url = useImage(shown?.id);
  const info = PROVIDERS[images.provider];
  const outdated = versions.length > 0 && stale(project, state, entry);

  return (
    <div className="pt">
      <div className="cx-figure">
        {shown && !showFigure ? (
          <figure className="pt-frame">
            {url ? <img src={url} alt={shown.caption} /> : <span className="ph" />}
            <figcaption>{shown.caption}</figcaption>
          </figure>
        ) : (
          figure
        )}
        {painting && <div className="pt-busy" role="status">Painting…</div>}
      </div>
      <div className="pt-bar">
        <button
          className="pt-paint"
          disabled={painting || !hasKey}
          title={hasKey ? `${info.label}, about $${info.cost[images.quality].toFixed(2)}` : `Add a ${info.company} key in Settings`}
          onClick={() => {
            setPicked(null);
            setShowFigure(false);
            void illustrate(entry.key);
          }}
        >
          {painting ? 'Painting…' : versions.length ? (outdated ? 'Paint the new look' : 'Paint again') : 'Illustrate'}
        </button>
        {versions.length > 0 && figure && (
          <button className="mini" onClick={() => setShowFigure(!showFigure)}>{showFigure ? 'Show painting' : 'Show figure'}</button>
        )}
        {!hasKey && <span className="cx-muted">Add a {info.company} key in Settings to paint.</span>}
        {outdated && !painting && <span className="cx-muted">The look has changed since this was painted.</span>}
      </div>
      {versions.length > 0 && !showFigure && shown && (
        <>
          <div className="pt-gallery" role="group" aria-label="Versions">
            {versions.map((v) => (
              <Thumb key={v.id} id={v.id} on={v.id === shown.id} approved={v.id === set?.approved} onClick={() => setPicked(v.id)} />
            ))}
          </div>
          <div className="pt-acts">
            {shown.id !== set?.approved ? <button className="mini" onClick={() => approve(entry.key, shown.id)}>Approve this one</button> : <span className="cx-muted">Approved</span>}
            <button className="mini" aria-pressed={styleRefs.includes(shown.id)} onClick={() => toggleStyle(shown.id)}>
              {styleRefs.includes(shown.id) ? 'House style ✓' : 'Use as house style'}
            </button>
            <button className="mini" onClick={() => { remove(entry.key, shown.id); setPicked(null); }}>Delete</button>
            <span className="cx-muted pt-meta">{PROVIDERS[shown.provider as keyof typeof PROVIDERS]?.label ?? shown.provider} · {new Date(shown.createdAt).toLocaleDateString()}{shown.auto ? ' · automatic' : ''}</span>
          </div>
        </>
      )}
    </div>
  );
}
