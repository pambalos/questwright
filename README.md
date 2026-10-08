# Questwright

A writing app for LitRPG authors. The manuscript sits on the left; a game-style
character panel on the right fills itself in as you write. New characters, skills,
items, equipment slots and currencies appear the moment the prose introduces them,
and continuity checks catch the math before readers do.

> Working name.

## What works today

- **Editor** (TipTap) with chapters as headings. Paragraphs carry stable ids, so every
  change is tied to the words it came from.
- **System boxes apply instantly.** Bracketed lines (`[Skill Acquired: Flame Ward (Lv 1)]`,
  `[Level Up! Level 2]`, `+2 STR · +1 VIT`, `[Title Earned: Wolfbane]`, `+50 Gold`, …) are
  parsed with fixed rules: no AI, no cost.
- **Prose is read by Claude in the background.** Finished paragraphs go to `/api/extract`,
  two at a time, and come back as *loot*: proposals you claim or dismiss. Nothing from
  prose counts until you claim it.
- **Characters** start as roster cards and get a tab on their first stat, skill, item or
  currency, or when pinned. Aliases and "same person as" merges, including merges the AI
  proposes when the text reveals an identity.
- **Panels unlock as the story needs them**: stats, equipment slots, inventory, skills,
  currencies, blessings, titles. The World tab lists the system's definitions.
- **The panel follows the cursor.** Click into chapter 3 and every sheet shows chapter 3.
  The timeline slider replays the story.
- **Continuity checks**: balances below zero, items given up that were never held, a skill
  evolving from one never gained, a level going down. Flagged in the margin and on the sheet.
- **Local save** in the browser, plus export and import as JSON.

Next milestones: the 3D character figure, and series import with limited, newest-first backfill.

## Layout

```
packages/engine   Headless tracking engine. No UI, no network. Unit tested.
  parser.ts       Tier 1: system-box rules
  extraction.ts   Tier 2: the model's output schema, prompt, and conversion to proposals
  reconcile.ts    Keeps the change log in step with an edited manuscript
  ledger.ts       Folds the change log into character sheets as of any paragraph
apps/web          Next.js app: editor, panel, and the /api/extract route
```

## Running it

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # add ANTHROPIC_API_KEY to turn on AI reading
npm run dev                                     # http://localhost:3000
```

Without a key the app still works: system boxes are tracked and the header says AI
reading is off.

```bash
npm test           # engine tests
npm run typecheck
npm run lint
npm run build
```

## AI reading: model, cost and safety

- Calls `claude-opus-5-5` at effort `low`, with structured output validated against the
  engine's schema and server-side refusal fallback on. Override with `QW_MODEL` / `QW_EFFORT`.
- One request per prose paragraph, sent again only when that paragraph's text changes. The
  paragraph under the cursor waits until you stop typing for four seconds. **Pause AI** in
  the header stops all requests.
- The key stays on the server. **Before deploying anywhere public, set `QW_ACCESS_CODE`**
  or put the deployment behind Vercel's deployment protection; otherwise anyone who finds
  the URL can spend your key. With a code set, the app asks for it once per browser.
- The manuscript leaves the browser only for these extraction requests.
