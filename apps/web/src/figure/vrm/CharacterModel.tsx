'use client';

import type { ArtStyle, Character, Look } from '@questwright/engine';
import { useEffect, useRef, useState } from 'react';
import { Figure2D } from '../Figure2D';
import type { Feature } from '../gear';
import { modelFor } from './models';
import type { CharacterStage } from './stage';

interface Props {
  character: Character;
  look: Look;
  features: Feature[];
  style: ArtStyle;
  highlight: string | null;
  label: string;
  /** Bumped when the author uploads a new custom model, to force a reload. */
  modelVersion?: number;
  /** Body suggested by the prose, used when the author has not chosen one. */
  suggestedModel?: string;
}

/** The character screen: a posed, lit VRM model wearing what the sheet says. Falls back to 2D without WebGL. */
export function CharacterModel({ character, look, features, style, highlight, label, modelVersion = 0, suggestedModel }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<CharacterStage | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [used, setUsed] = useState(false);
  const [state, setState] = useState({ loading: true, progress: 0, error: null as string | null, portrait: false });
  const model = modelFor(look, character, suggestedModel);

  useEffect(() => {
    let live = true;
    import('./stage')
      .then(({ CharacterStage }) => {
        if (!live || !host.current) return;
        try {
          const s = new CharacterStage();
          s.onState = setState;
          s.onUsed = () => setUsed(true);
          host.current.prepend(s.canvas);
          stage.current = s;
          setReady(true);
        } catch {
          setFailed(true);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      stage.current?.canvas.remove();
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void stage.current?.show({ id: character.id, version: modelVersion, model, look, features, style });
  }, [ready, character.id, model, look, features, style, modelVersion]);

  useEffect(() => {
    stage.current?.highlight(highlight);
  }, [ready, highlight, features]);

  if (failed) return <Figure2D look={look} features={features} style={style} highlight={highlight} label={label} />;

  return (
    <div className={`v3d${used ? ' used' : ''}`} ref={host} role="group" aria-label={label}>
      <div className="v3d-ui">
        <div className="seg" role="group" aria-label="Camera">
          <button type="button" aria-pressed={state.portrait} className={state.portrait ? 'on' : ''} onClick={() => stage.current?.setMode(true)}>Portrait</button>
          <button type="button" aria-pressed={!state.portrait} className={!state.portrait ? 'on' : ''} onClick={() => stage.current?.setMode(false)}>Body</button>
        </div>
        <button type="button" className="v3d-btn" onClick={() => stage.current?.reset()}>Reset view</button>
      </div>
      {state.loading && (
        <div className="v3d-loading" role="status">
          <span>Summoning {character.name}…</span>
          <i style={{ width: `${Math.round(state.progress * 100)}%` }} />
        </div>
      )}
      {state.error && <div className="v3d-loading" role="alert"><span>{state.error}</span></div>}
      <div className="v3d-hint">Drag to rotate · scroll or pinch to zoom</div>
    </div>
  );
}
