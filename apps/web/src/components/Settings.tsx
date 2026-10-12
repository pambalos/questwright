'use client';
/* eslint-disable @next/next/no-img-element -- paintings are local blob: URLs, which next/image cannot optimise */

import type { ArtStyle, RenderStyle } from '@questwright/engine';
import { useState } from 'react';
import { Figure2D } from '@/figure/Figure2D';
import { defaultLook, lookOf, STYLE_LABEL } from '@/figure/look';
import { desktop } from '@/lib/desktop';
import { requestsFor } from '@/lib/extractor';
import { PROVIDER_IDS, PROVIDERS, type ImageProvider } from '@/lib/image-providers';
import { useImage } from '@/lib/illustrator';
import { thisMonth, useStudio, type PanelMode } from '@/lib/store';
import { ApiKeyDialog } from './ApiKeyDialog';

const NONE: string[] = [];

const RENDERS: { key: RenderStyle; label: string; blurb: string }[] = [
  { key: 'anime', label: 'Anime', blurb: 'Animated 3D figures with cel shading, glow and idle motion.' },
  { key: 'storybook', label: 'Storybook', blurb: 'Still pen-and-ink plates on paper, like the illustrations in a printed book.' },
];

const PANEL_MODES: { key: PanelMode; label: string }[] = [
  { key: 'open', label: 'Beside the editor' },
  { key: 'mini', label: 'Icon bar' },
  { key: 'full', label: 'Full screen' },
];

const SHORTCUTS: [string, string][] = [
  ['Ctrl+S', 'Save now'],
  ['Ctrl+\\', 'Fold the panel into its icon bar, or open it'],
  ['Esc', 'Leave full-screen panel'],
  ['Shift+Enter', 'New line inside a system box'],
];

const money = (usd: number) => `$${usd < 0.1 && usd > 0 ? usd.toFixed(3).replace(/(\.\d\d)0$/, '$1') : usd.toFixed(2)}`;

function StyleRef({ id }: { id: string }) {
  const url = useImage(id);
  const toggle = useStudio((s) => s.toggleStyleRef);
  return (
    <figure className="style-ref">
      {url ? <img src={url} alt="House style example" /> : <span className="ph" />}
      <button className="mini" onClick={() => toggle(id)}>Remove</button>
    </figure>
  );
}

/** Which image service paints the codex, how well, and whether it paints on its own. */
function Illustrations() {
  const images = useStudio((s) => s.images);
  const keys = useStudio((s) => s.imageKeys);
  const spend = useStudio((s) => s.imageSpend);
  const styleRefs = useStudio((s) => s.project.styleRefs) ?? NONE;
  const count = useStudio((s) => Object.values(s.project.illustrations ?? {}).reduce((n, x) => n + x.versions.length, 0));
  const setImages = useStudio((s) => s.setImageSettings);
  const [keyFor, setKeyFor] = useState<ImageProvider | null>(null);
  const spent = spend.month === thisMonth() ? spend.usd : 0;
  const info = PROVIDERS[images.provider];

  return (
    <section>
      <h3>Illustrations</h3>
      <p className="note">Painted pictures for the codex and character cards. Claude writes each picture&apos;s brief from what the book remembers; the service below paints it.</p>
      <div className="provider-cards" role="radiogroup" aria-label="Image service">
        {PROVIDER_IDS.map((id) => {
          const p = PROVIDERS[id];
          return (
            <div key={id} className={`provider-card${images.provider === id ? ' sel' : ''}`}>
              <button role="radio" aria-checked={images.provider === id} className="provider-pick" onClick={() => setImages({ provider: id })}>
                <b>{p.label}</b>
                <span className="sub">{p.company}</span>
                <small>{p.blurb}</small>
                <span className="price">{money(p.cost.final)} a painting · draft {money(p.cost.draft)}</span>
              </button>
              <div className="provider-key">
                <span className={`key-state${keys[id] ? ' on' : ''}`}>{keys[id] ? 'Key added' : 'No key'}</span>
                {desktop() ? (
                  <button className="mini" onClick={() => setKeyFor(id)}>{keys[id] ? 'Change key' : 'Add key'}</button>
                ) : (
                  !keys[id] && <span className="sub">Set {p.env} on the server</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <h4>Quality</h4>
      <div className="chips">
        <button className={`chip${images.quality === 'final' ? ' sel' : ''}`} aria-pressed={images.quality === 'final'} onClick={() => setImages({ quality: 'final' })}>Full quality · {money(info.cost.final)}</button>
        <button className={`chip${images.quality === 'draft' ? ' sel' : ''}`} aria-pressed={images.quality === 'draft'} onClick={() => setImages({ quality: 'draft' })}>Draft · {money(info.cost.draft)}</button>
      </div>
      <label className="check">
        <input type="checkbox" checked={images.auto} onChange={(e) => setImages({ auto: e.target.checked })} />
        Paint automatically when an entry gains a description, or its look or gear changes
      </label>
      <label className="cap">
        Stop automatic painting for the month at $
        <input type="number" min={0} max={1000} step={1} value={images.monthlyCap} onChange={(e) => setImages({ monthlyCap: Math.max(0, Number(e.target.value) || 0) })} aria-label="Monthly limit in US dollars" />
      </label>
      <p className="note">
        This month: about {money(spent)} on paintings ({count} {count === 1 ? 'painting' : 'paintings'} in this book). Estimates; your {info.company} bill is the real figure.
      </p>
      <h4>House style</h4>
      {styleRefs.length ? (
        <div className="style-refs">{styleRefs.map((id) => <StyleRef key={id} id={id} />)}</div>
      ) : (
        <p className="note">None yet. Mark up to three paintings you like as house style in the codex, and every new painting will match them.</p>
      )}
      {keyFor && <ApiKeyDialog service={keyFor} hasKey={keys[keyFor]} onClose={() => setKeyFor(null)} />}
    </section>
  );
}

/** Every key Questwright can use, in one place: add, change or remove each. */
function ApiKeys() {
  const imageKeys = useStudio((s) => s.imageKeys);
  const aiBackend = useStudio((s) => s.aiBackend);
  const [editing, setEditing] = useState<ImageProvider | 'anthropic' | null>(null);
  const rows: { id: ImageProvider | 'anthropic'; name: string; use: string; env: string; has: boolean }[] = [
    { id: 'anthropic', name: 'Anthropic', use: 'AI reading, codex entries and painting briefs. Optional: without it, your Claude subscription is used through Claude Code.', env: 'ANTHROPIC_API_KEY', has: aiBackend?.kind === 'api' },
    ...PROVIDER_IDS.map((id) => ({ id, name: PROVIDERS[id].company, use: `Paints illustrations with ${PROVIDERS[id].label}.`, env: PROVIDERS[id].env, has: imageKeys[id] })),
  ];
  const app = Boolean(desktop());
  return (
    <section>
      <h3>API keys</h3>
      <p className="note">
        {app
          ? 'Keys are stored encrypted on this computer and only sent to the company they belong to. Saving or removing one restarts the app’s server for a moment.'
          : 'Keys live on the server, as environment variables (for example in apps/web/.env.local). Restart the server after changing them.'}
      </p>
      <div className="key-rows">
        {rows.map((r) => (
          <div key={r.id} className="key-row">
            <div className="key-what">
              <b>{r.name}</b>
              <small>{r.use}</small>
            </div>
            <span className={`key-state${r.has ? ' on' : ''}`}>{r.has ? 'Added' : 'Not set'}</span>
            {app ? (
              <button className="mini" onClick={() => setEditing(r.id)}>{r.has ? 'Change or remove' : 'Add'}</button>
            ) : (
              <code className="key-env">{r.env}</code>
            )}
          </div>
        ))}
      </div>
      {editing && <ApiKeyDialog service={editing === 'anthropic' ? undefined : editing} hasKey={rows.find((r) => r.id === editing)!.has} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** Settings for the open book (how its characters are drawn) and for the app (AI reading, panel layout). */
export function Settings({ onClose }: { onClose(): void }) {
  const render = useStudio((s) => s.project.art?.render ?? 'anime');
  const palette = useStudio((s) => s.project.art?.style ?? 'painterly');
  const setRender = useStudio((s) => s.setRenderStyle);
  const setPalette = useStudio((s) => s.setArtStyle);
  const title = useStudio((s) => s.project.title);
  const characters = useStudio((s) => s.project.characters);
  const protagonistId = useStudio((s) => s.project.protagonistId);
  const aiStatus = useStudio((s) => s.aiStatus);
  const aiBackend = useStudio((s) => s.aiBackend);
  const aiEnabled = useStudio((s) => s.aiEnabled);
  const setAiEnabled = useStudio((s) => s.setAiEnabled);
  const panelMode = useStudio((s) => s.panelMode);
  const setPanelMode = useStudio((s) => s.setPanelMode);
  const setPanelWidth = useStudio((s) => s.setPanelWidth);
  const [keyOpen, setKeyOpen] = useState(false);
  const rereadPlan = useStudio((s) => s.rereadPlan);
  const rereadBook = useStudio((s) => s.rereadBook);
  const reading = useStudio((s) => s.queue.length + s.inFlight.length);
  const [reread, setReread] = useState<{ paragraphs: number; words: number; requests: number } | null>(null);
  const planReread = () => {
    const plan = rereadPlan();
    const chars = plan.reduce((n, p) => n + p.chars, 0);
    setReread({ paragraphs: plan.length, words: Math.round(chars / 5.5), requests: requestsFor(plan, aiBackend?.kind === 'claude-cli') });
  };

  // Preview with the book's protagonist when there is one.
  const hero = (protagonistId && characters[protagonistId]) || Object.values(characters).find((c) => !c.mergedInto);
  const look = hero ? lookOf(hero, protagonistId) : defaultLook({ id: 'preview', name: 'Hero' });

  const ai =
    aiStatus === 'checking'
      ? 'Checking…'
      : aiStatus === 'locked'
        ? 'Locked: this server needs an access code.'
        : aiStatus === 'off'
          ? aiBackend?.signedOut
            ? 'Off: Claude Code is signed out. Run claude in a terminal and log in.'
            : 'Off: no API key, and Claude Code was not found.'
          : aiBackend?.kind === 'claude-cli'
            ? `On: reading with your Claude ${aiBackend.plan ? aiBackend.plan[0]!.toUpperCase() + aiBackend.plan.slice(1) : ''} subscription through Claude Code.`
            : 'On: reading with an Anthropic API key.';

  return (
    <div className="modal" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dlg settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>

        <section>
          <h3>Character art <span className="scope">for “{title}”</span></h3>
          <div className="style-cards" role="radiogroup" aria-label="How characters are drawn">
            {RENDERS.map((r) => (
              <button key={r.key} role="radio" aria-checked={render === r.key} className={`style-card${render === r.key ? ' sel' : ''}`} onClick={() => setRender(r.key)}>
                <span className={`style-preview render-${r.key}`}>
                  <Figure2D look={look} features={[]} style={palette} label="" />
                </span>
                <b>{r.label}</b>
                <small>{r.blurb}</small>
              </button>
            ))}
          </div>
          <h4>Colour palette</h4>
          <div className="chips">
            {(Object.keys(STYLE_LABEL) as ArtStyle[]).map((k) => (
              <button key={k} className={`chip${palette === k ? ' sel' : ''}`} aria-pressed={palette === k} onClick={() => setPalette(k)}>{STYLE_LABEL[k]}</button>
            ))}
          </div>
        </section>

        <Illustrations />

        <section>
          <h3>AI reading</h3>
          <p>{ai}</p>
          <div className="row-btns">
            {aiStatus === 'on' && <button onClick={() => setAiEnabled(!aiEnabled)}>{aiEnabled ? 'Pause reading' : 'Resume reading'}</button>}
            {desktop() && <button onClick={() => setKeyOpen(true)}>{aiBackend?.kind === 'api' ? 'Change API key' : 'Add an API key'}</button>}
            {aiStatus === 'on' && !reread && <button onClick={planReread}>Re-read this book…</button>}
          </div>
          {reading > 0 && !reread && <p className="note">{reading} {reading === 1 ? 'paragraph' : 'paragraphs'} waiting to be read.</p>}
          {reread && (
            <div className="reread" role="alertdialog" aria-label="Re-read this book">
              <p>
                Read all {reread.paragraphs.toLocaleString()} paragraphs of “{title}” again (about {reread.words.toLocaleString()} words) to fill in the compendium, the AI&apos;s
                memory, magic systems and relations from the start. That is about <b>{reread.requests.toLocaleString()} {reread.requests === 1 ? 'request' : 'requests'}</b>
                {aiBackend?.kind === 'claude-cli' ? ' on your Claude subscription, which shares its usage limits with Claude Code.' : ' to the Anthropic API, billed to your key.'}
              </p>
              <p className="note">Finds you already claimed or dismissed are not proposed again, and facts are not repeated. You can pause reading any time from the header.</p>
              <div className="row-btns">
                <button className="go" onClick={() => { rereadBook(); setReread(null); }}>Re-read {reread.paragraphs.toLocaleString()} paragraphs</button>
                <button onClick={() => setReread(null)}>Cancel</button>
              </div>
            </div>
          )}
        </section>

        <ApiKeys />

        <section>
          <h3>Panel</h3>
          <div className="chips">
            {PANEL_MODES.map((m) => (
              <button key={m.key} className={`chip${panelMode === m.key ? ' sel' : ''}`} aria-pressed={panelMode === m.key} onClick={() => setPanelMode(m.key)}>{m.label}</button>
            ))}
            <button className="chip" onClick={() => setPanelWidth(420)}>Reset width</button>
          </div>
        </section>

        <section>
          <h3>Shortcuts</h3>
          <dl className="keys">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>
            ))}
          </dl>
        </section>

        <div className="acts">
          <button className="go" onClick={onClose}>Done</button>
        </div>
      </div>
      {keyOpen && <ApiKeyDialog hasKey={aiBackend?.kind === 'api'} onClose={() => setKeyOpen(false)} />}
    </div>
  );
}
