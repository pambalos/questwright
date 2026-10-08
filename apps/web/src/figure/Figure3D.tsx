'use client';

import type { ArtStyle, Look } from '@questwright/engine';
import { useEffect, useRef, useState } from 'react';
import { Figure2D } from './Figure2D';
import type { Feature } from './gear';
import type { Viewer3D } from './viewer3d';

interface Props {
  id: string;
  look: Look;
  features: Feature[];
  style: ArtStyle;
  highlight: string | null;
  label: string;
}

/** The rotatable 3D character, falling back to the 2D figure where WebGL is unavailable. */
export function Figure3D({ id, look, features, style, highlight, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer3D | null>(null);
  const [failed, setFailed] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [used, setUsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    import('./viewer3d')
      .then(({ Viewer3D }) => {
        if (!live || !host.current) return;
        try {
          const v = new Viewer3D();
          v.onMode = setPortrait;
          v.onUsed = () => setUsed(true);
          host.current.prepend(v.canvas);
          viewer.current = v;
          setReady(true);
        } catch {
          setFailed(true);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      viewer.current?.canvas.remove();
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    viewer.current?.setCharacter(id, look, features, style);
  }, [ready, id, look, features, style]);

  useEffect(() => {
    viewer.current?.highlight(highlight);
  }, [ready, highlight, features]);

  if (failed) return <Figure2D look={look} features={features} style={style} highlight={highlight} label={label} />;

  return (
    <div className={`v3d${used ? ' used' : ''}`} ref={host} role="group" aria-label={label}>
      <div className="v3d-ui">
        <div className="seg" role="group" aria-label="Camera">
          <button type="button" aria-pressed={portrait} className={portrait ? 'on' : ''} onClick={() => viewer.current?.setMode(true)}>Portrait</button>
          <button type="button" aria-pressed={!portrait} className={!portrait ? 'on' : ''} onClick={() => viewer.current?.setMode(false)}>Body</button>
        </div>
        <button type="button" className="v3d-btn" onClick={() => viewer.current?.reset()}>Reset view</button>
      </div>
      <div className="v3d-hint">Drag to rotate · scroll or pinch to zoom</div>
    </div>
  );
}
