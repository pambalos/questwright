'use client';

import type { ArtStyle, RenderStyle } from '@questwright/engine';
import { useState } from 'react';
import { Figure2D } from '@/figure/Figure2D';
import { defaultLook, lookOf, STYLE_LABEL } from '@/figure/look';
import { desktop } from '@/lib/desktop';
import { requestsFor } from '@/lib/extractor';
import { useStudio, type PanelMode } from '@/lib/store';
import { ApiKeyDialog } from './ApiKeyDialog';

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
