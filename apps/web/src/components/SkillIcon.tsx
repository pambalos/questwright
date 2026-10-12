'use client';
/* eslint-disable @next/next/no-img-element -- icons are local blob: URLs, which next/image cannot optimise */

import { loreKey } from '@questwright/engine';
import { iconKey, illustrate, paintIcons, useImage, useImages, usePainter } from '@/lib/illustrator';
import { useStudio } from '@/lib/store';

const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);

/**
 * A skill's painted ability icon, or its initials until one is painted.
 * Clicking an unpainted icon paints it; a painted one opens its codex page.
 */
export function SkillIcon({ name, size = 28 }: { name: string; size?: number }) {
  const entry = loreKey(name);
  const key = iconKey(entry);
  const id = useStudio((s) => s.project.illustrations?.[key]?.approved);
  const url = useImage(id);
  const painting = useStudio((s) => s.painting.includes(key));
  const openCodex = useStudio((s) => s.setCodexOpen);
  const painter = usePainter();
  const title = url ? `${name}: open in the codex` : painting ? `Painting an icon for ${name}…` : painter.ready ? `Paint an icon for ${name} with ${painter.label}` : `${painter.hint} to paint icons`;
  return (
    <button
      type="button"
      className={`skill-icon${url ? ' painted' : ''}${painting ? ' busy' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={title}
      aria-label={title}
      disabled={!url && (painting || !painter.ready)}
      onClick={() => (url ? openCodex(entry) : void illustrate(key))}
    >
      {url ? <img src={url} alt="" /> : <span>{initials(name)}</span>}
    </button>
  );
}

/** "Paint 5 icons": every skill here that has no icon yet, one after another. */
export function PaintIconsButton({ names }: { names: string[] }) {
  const illustrations = useStudio((s) => s.project.illustrations);
  const painting = useStudio((s) => s.painting);
  const painter = usePainter();
  const missing = names.filter((n) => {
    const k = iconKey(loreKey(n));
    return !illustrations?.[k]?.approved && !painting.includes(k);
  });
  if (!missing.length || !painter.ready) return null;
  const cost = painter.cost * missing.length;
  return (
    <button
      type="button"
      className="mini paint-icons"
      title={`Paint ability icons with ${painter.label}${painter.local ? ', on this computer' : `, about $${cost.toFixed(2)} in all`}`}
      onClick={() => paintIcons(missing.map(loreKey))}
    >
      Paint {missing.length} {missing.length === 1 ? 'icon' : 'icons'}{painter.local ? '' : ` · $${cost.toFixed(2)}`}
    </button>
  );
}

/** Icon URLs for a list of skill names, for drawing inside SVG trees. */
export function useSkillIcons(names: string[]): Record<string, string> {
  const illustrations = useStudio((s) => s.project.illustrations);
  const ids = names.map((n) => illustrations?.[iconKey(loreKey(n))]?.approved);
  const urls = useImages(ids);
  const out: Record<string, string> = {};
  names.forEach((n, i) => {
    const id = ids[i];
    if (id && urls[id]) out[n] = urls[id];
  });
  return out;
}

/** The icon for a codex entry, with its versions: paint, repaint and pick which one is used. */
export function IconRow({ entryKey, name }: { entryKey: string; name: string }) {
  const key = iconKey(entryKey);
  const set = useStudio((s) => s.project.illustrations?.[key]);
  const approve = useStudio((s) => s.approveIllustration);
  const painting = useStudio((s) => s.painting.includes(key));
  const painter = usePainter();
  const versions = set?.versions ?? [];
  const urls = useImages(versions.map((v) => v.id));
  const main = set?.approved ? urls[set.approved] : undefined;
  return (
    <div className="icon-row">
      <span className="icon-big">{main ? <img src={main} alt={`${name} icon`} /> : <span>{initials(name)}</span>}</span>
      <div className="icon-side">
        <b>Ability icon</b>
        <div className="icon-versions">
          {versions.map((v) => (
            <button key={v.id} className={v.id === set?.approved ? 'on' : ''} title={v.id === set?.approved ? 'In use' : 'Use this one'} onClick={() => approve(key, v.id)}>
              {urls[v.id] ? <img src={urls[v.id]} alt="" /> : null}
            </button>
          ))}
        </div>
        <button className="pt-paint" disabled={painting || !painter.ready} title={painter.ready ? `${painter.label}` : painter.hint} onClick={() => void illustrate(key)}>
          {painting ? 'Painting…' : versions.length ? 'Paint another' : 'Paint icon'}
        </button>
      </div>
    </div>
  );
}
