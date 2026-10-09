# Wickwatch — Architecture & Engineering Contract

This document is the contract every contributor (human or agent) follows. The game design
lives in `docs/GDD.md` (the source of truth for rules, numbers, ids and art direction). This file
says **where code lives, how modules talk, and the coding rules**. When the GDD and this file
disagree on *rules*, the GDD wins; on *code structure*, this file wins.

## 1. Stack

- Vite 8 + React 19 + TypeScript 5.9 (strict, `noUnusedLocals`, `noUnusedParameters`).
- Vitest 5 for unit tests (`tests/unit/**`), Playwright for e2e (`tests/e2e/**`).
  Locally, launch Chromium with `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`
  (or set `PLAYWRIGHT_CHROMIUM_PATH`).
- Node `ws` server for online play (`server/`), run with `tsx`.
- Fonts via `@fontsource/*` (Cinzel, Cinzel Decorative, IM Fell English, EB Garamond).
- **No new npm dependencies** without the integrator's approval. Everything is hand-written:
  no UI kit, no animation library, no state library.

## 2. Directory layout

```
docs/                 GDD.md, ARCHITECTURE.md, RULES.md (player rules; tables generated), screenshots/
src/
  engine/             PURE rules engine. No DOM, no React, no Math.random, no Date, no timers.
    index.ts          Public API (see §4). UI/server import ONLY from here (and types.ts).
    types.ts          All shared types: vocabularies, content schemas, config, state, actions, events.
    rng.ts            mulberry32 + named streams (seatStream, streamInt/Pick/Shuffle/Weighted, ...).
    geometry.ts       Coordinates, distance, reading order, patterns, line of sight, areas, push paths.
    content.ts        Loads + validates content JSON into a typed registry; mergeMod; contentHash.
    state.ts          Mutation context (Ctx), ids, lookups, GameState -> BoardQuery adapter, active rules.
    validation.ts     OK / fail(reason) helpers.
    reducer.ts        validateAction / applyAction; undo frames; boss watch refresh.
    setup.ts          createGame, night setup (site, Candles, deploy, enemies, Plumes, hands), snapshots.
    sites.ts          Generated Vigil sites + fixed maps (first_vigil, hollow_nave, last_flame_ring).
    spawn.ts          Piece creation and the placement routine (§9.5).
    decks.ts          Shuffles, draws (hand limit), discards.
    phases.ts         Phase machine (`advance`), rounds, seat turns and claims, Tally, Dawn, Toll, Omen.
    actions.ts        Piece actions: move, strike, relight, light_shrine, free actions (melt, ring_bell).
    strike.ts         Strike targets + previews (damage, lethal, Take, push) and resolution.
    combat.ts         Damage, Ward, death, kill credit, push/pull/swap/bump, statuses, Hot Wax.
    choices.ts        deploy/ready, choose_toll, claim_turn, end_turn, carry_over, draft/boon picks.
    cards.ts          Card play: costs, limits, multi-step targeting, previews.
    targeting.ts      Target candidates and range adjustments for cards, Powers and the Bell.
    targetInfo.ts     The CardTargetInfo answer for one step of a multi-step play.
    previewEvents.ts  Folds a simulated play's events into an EffectPreview.
    effects.ts        Effect-op interpreter (every op of GDD A.2) + trait/Charm triggers.
    customOps.ts      Player-side custom ops (lantern_volley, rouse).
    tileOps.ts        create_tile / move_tile (Hot Wax, Rubble, Shifting Chimneys).
    charms.ts         Attach / replace / return Charms.
    powers.ts         Hero Powers (use_power).
    heirlooms.ts      Heirlooms and their night-start triggers.
    undo.ts           Undo frames and commit points.
    votes.ts          Retry this Night and Concede votes.
    snuff.ts          Enemy targeting, movement, intents and aim, Snuff Strike, Plumes and rising.
    bosses.ts         Boss spawn, HP and phases, specials (CHECK/CHECKMATE, Hunger), death, Glory data.
    bossIntents.ts    The 9 boss intents: targeting, planning, resolution, queue text.
    bossMove.ts       Boss footprint movement and path search.
    tutorial.ts       first_vigil scripted Night 1 (§15.2) and the coach-mark script.
    preview.ts        previewSnuffStrike, intentQueue, dangerMap, previewMoveDanger.
    view.ts           viewFor (per-seat views) and eventsForSeat (hidden information in events).
    log.ts            Human-readable log lines (absolute coordinates, first names).
    modes/vigil.ts    Dread, thresholds, victory/defeat, stars, Dawn recovery, Retry snapshot.
    modes/lastFlame.ts  Truce, Glory (+breakdown, leader, Bounty), turn order, First Light, kill clock.
    modes/gloam.ts    Gloam schedule, warning, closing, damage, the Gloam Bell.
    modes/falls.ts    Falls: respawn vs elimination, elimination bands.
    modes/haunt.ts    Haunting: options, validation, apply, the bot's pick.
    modes/lastFlameEnd.ts  End reasons, standings and tie-breaks, concede.
    bots/             planTurn/planBotTurn (Apprentice greedy, Warden beam, Elder deeper), botChoice,
                      hint; planningState (plans on viewFor), actionGen, evaluate, search, profiles.
  content/            Data files (JSON), one per registry (GDD A.1) plus powers, traits, overlays, rules.
  config/             Rule parameters + defaults, presets (Quick Play, Quick Last Flame, Daily, custom),
                      resolveConfig + validation, settings code (WAX1:), presentation settings, local
                      profile (unlock ladder, custom presets), guarded storage. Pure TS (server too).
  audio/              Procedural WebAudio SFX + generative music (src/audio/index.ts).
  art/                Procedural SVG/CSS React components: pieces, bosses, board, icons, cards, dice,
                      scenes, palette. Pure presentation, no engine logic. Dev gallery: /gallery.html.
  game/               Client controller (NOT React), see §6: controller, transport, botDriver, bots +
                      bot.worker (Web Worker), highlights, targeting, selection, timing, sfx, viewPatch.
  net/                Online client (§7): protocol.ts (shared with server/), client, session, transport.
  ui/
    App.tsx           Screen router + global overlays; heavy screens are lazy (app/lazyScreens.ts).
    theme.css         Palette tokens (GDD §16.2), typography, base components.
    app/              Plain-TS app plumbing: store, navigation, services (context), launch, online,
                      contentStore, profileStore, presentationEffects, toasts, lazyScreen(s).
    components/       Buttons, chips, modal, tooltip, toasts, loading veil, screen error boundary, ...
    model/            Content described in words (describe.ts), shared by Codex, hero picker, docs.
    screens/          Title, hero picker, setup/, lobby/, howto/, codex/, settings/.
    game/             Game screen: board, pieces, intents, hand, rails, HUD, overlays, coach marks.
    fx/               Darkness + particle canvases, screen shake/flash, the FX director.
  main.tsx            Entry point (fonts, theme, <App/>).
server/               Node game server (§7): index (CLI), app (HTTP + /ws), hub, rooms, game, driver,
                      roomConfig, persist, static, log.
scripts/              rules-tables.ts (docs/RULES.md tables, --check), render-icons.ts (public/icons),
                      capture-screenshots.ts (docs/screenshots from a running build). Run with tsx.
public/               favicon.svg, manifest.webmanifest, icons/ (PWA-lite; no service worker).
tests/unit/           Vitest (setup.ts preloads the lazy screens for jsdom files). Engine tests are the bulk.
tests/e2e/            Playwright flows (quickplay/tutorial, boss, lastflame, overlays, online).
.github/workflows/    ci.yml (typecheck, docs check, unit, build, e2e), pages.yml (deploy dist/ on main).
```

## 3. Engine principles

1. **Pure & deterministic.** `applyAction(state, action)` never mutates its input. Implementation
   pattern: `const next = cloneState(state)` (structuredClone) then mutate `next` freely.
   Randomness only through named RNG streams stored in `state.rng` (GDD B.3):
   `setup`, `map`, `spawn`, `omen`, `toll`, `decks:<seat>`, `draft:<seat>`, `bot:<seat>`, each
   seeded with `seedFromString(seed + "\u0000" + stream)`.
2. **Serializable state.** `GameState` is plain JSON (no classes, Maps, Sets, functions, undefined
   in arrays). `JSON.parse(JSON.stringify(s))` must round-trip.
3. **Data-driven content.** All numbers/ids come from `src/content/*.json` through the registry in
   `content.ts`. Engine code references behaviour by id only where the GDD defines a bespoke
   rule (traits, powers, `custom` ops, boss specials). Mods are JSON patches merged over the base
   content and validated (GDD A.3).
4. **Events for presentation.** Every state change that the player should *see* emits a
   `GameEvent` (move, strike, damage, death, summon, card played, intent declared, die roll,
   dread change, ...). The UI animates events in order, then renders the resulting state.
   Events carry enough data to animate without diffing states (piece ids, from/to positions,
   amounts, hp after).
5. **Validation with reasons.** `validateAction` returns `{ ok: true }` or
   `{ ok: false, reason: ReasonCode, params }` using the reason codes of GDD §15.6. The UI shows
   the localized string; the server rejects with it.
6. **Automated phases** advance only through the system action `{ type: 'advance' }`. A helper
   `pendingAutomation(state)` tells the controller whether an `advance` is due (and which phase),
   so the controller can pace animations. Bot seats never act inside the reducer by themselves;
   the controller (or server) asks `planBotTurn` and dispatches the resulting actions.
7. **No UI concerns in the engine** (no pixel sizes, colours, timings). Log text is fine.

## 4. Engine public API (`src/engine/index.ts`)

```ts
// Core
createGame(config: GameConfig, opts?: { content?: ContentRegistry }): GameState
applyAction(state, action, reg?): ApplyResult
  // ApplyResult = { ok: true; state: GameState; events: GameEvent[] }
  //             | { ok: false; reason: ReasonCode; params?: Record<string, string | number> }
validateAction(state, action, reg?): Validation      // { ok: true } | { ok: false, reason, params }
pendingAutomation(state): null | { phase: PhaseId }   // an 'advance' is due
activeSeats(state): number[]                          // seats allowed to act right now

// Queries for the UI (pips and turn are NOT checked; validateAction does that)
legalMoves(state, pieceId): Pos[]                      // incl. Chimney exits
legalStrikes(state, pieceId): StrikeOption[]           // damage / lethal / Take / push previews
cardTargets(state, seat, cardUid, query?: TargetQuery): CardTargetInfo   // multi-step: query = { mode?, chosen? }
powerTargets(state, seat, query?): CardTargetInfo
freeActionTargets(state, seat, 'melt' | 'ring_bell'): CardTargetInfo
hauntOptions(state, seat): HauntOption[]               // Last Flame: tiles + haunted hero
canUndo(state, seat): boolean
retryOpen(state): boolean;  voteStatus(state, 'retry' | 'concede'): VoteStatus

// Previews
intentQueue(state): IntentView[]                       // resolution order, with human text
dangerMap(state): DangerMap                            // tile key -> incoming damage
previewSnuffStrike(state): { state: GameState; events: GameEvent[] }   // the real resolution on a clone
previewMoveDanger(state, pieceId, to): MoveDanger      // the "!" badge on a move dot

// Bots (node budgets, deterministic per seed)
planTurn(state, seat, level, opts?): PlanResult        // { actions, expansions, budget, timedOut, score }
planBotTurn(state, seat, level, opts?): Action[]       // full seat turn (ends with end_turn)
botChoice(state, seat): Action | null                  // ready/toll/carry_over/draft/boon/haunt picks
hint(state, seat): Action | null                       // the Warden planner's first action

// Views (hidden information)
viewFor(state, seat): GameState                        // deck orders hidden; Last Flame masks rivals' hands
eventsForSeat(events, seat, mode): GameEvent[];  HIDDEN_CARD

// Content (re-exported from content.ts)
getContent(); setContent(reg | null); loadBaseContent(); buildRegistry(files)
mergeMod(base, mod): { registry, errors }; contentHash(reg); reasonText(code, params)
CONTENT_FILES, CONTENT_FILE_NAMES, MOD_SIZE_LIMIT, starterDeckIds, CUSTOM_OP_DOCS

// Mode helpers
// Vigil:      currentThreshold, dreadThresholdValues, starsFor
// Bosses:     bossMaxHp, phaseThreshold, bossPhaseForHp, bossPlayerCount, openEscapes, bossFallen, bossGlory
// Last Flame: isTruceActive, truceForNight, gloryLeader, GLORY_REASONS, clockwiseFromFirstLight,
//             inGloam, nextClosing, roundsToNextClosing, eliminatedOnFall, hauntedHeroAt, hauntingOn,
//             lastFlameStandings, compareStandings, lastFlameEndReason
// Tutorial:   tutorialScript, tutorialAction, matchesTutorialStep, tutorialTurnActive
// Sites:      checkSiteLayout, generateVigilSite, buildFixedMap
// Misc:       pieceName; everything in types.ts, rng.ts and geometry.ts is re-exported
```

Names may grow, but these must exist with these semantics. Anything not exported from
`index.ts` is private to the engine.

## 5. Coordinates & ids

- `Pos = { x: number; y: number }`, x = file (0 = a), y = rank (0 = rank 1). Rank 1 is the bottom
  edge in the default view. `posKey(p) = "x,y"`, `sqName(p) = "c3"`.
- Runtime piece ids: `"p<n>"`; card instance uids: `"c<n>"`; intents `"i<n>"`; plumes `"m<n>"`,
  all from `state.nextId`.
- Content ids are snake_case exactly as in the GDD.
- `GameConfig` keys are the GDD's snake_case parameter names (§14 / Engineering summary), so the
  settings code, the Setup screen and the docs share one vocabulary. Everything else in TS is
  camelCase.

## 6. Client controller (`src/game/`)

`GameController` (plain TS class with a subscribe API, consumed by React via
`useSyncExternalStore`; barrel `src/game/index.ts`):
- talks to the rules through a `GameTransport`: `LocalTransport` (engine in this tab: solo,
  hot-seat, demo; `load(state)` swaps in a crafted state for QA) or `NetTransport` (src/net);
- `getSnapshot()` → `{ state (shown, lags during playback), latest (authoritative), playing,
  animating, thinkingSeat, uiSeat, controlledSeats, selection, notice, confirmingEndTurn }`;
- plays engine events one at a time (`patchView`, §16.9 durations scaled by presentation
  settings), auto-dispatches `advance` when `pendingAutomation(state)` and playback is idle
  (local games only: online, the server paces), and emits sound cues (`onCue`, `sfx.ts`);
- runs bot seats through `BotDriver` + a `BotRunner` (Web Worker `bot.worker.ts`, synchronous
  fallback), dispatching their actions one at a time so they animate like a human's;
- input API: `selectPiece`, `clickTile`, `selectCard`/`pickTarget`/`dropCard`, `selectPower`,
  `endTurn`, `undo`, `ready`, `claim`, `haunt`, `moveCursor`/`confirm`, `requestHint`, …; every
  refusal becomes a `notice` with the reason text;
- `window.__ww = { controller, load }` while a game screen is mounted (QA and e2e hook).

## 7. Online (`server/` + `src/net/`)

- **Protocol** (`src/net/protocol.ts`, shared): one JSON object per message with a snake_case
  `type`, validated on both sides (`parseClientMessage` / `parseServerMessage`). Client:
  `hello`, `create_room`, `join_room`, `claim_seat`, `release_seat`, `set_ready`,
  `update_config`, `start_game`, `return_to_lobby`, `set_name`, `action`, `leave`, `ping`.
  Server: `welcome`, `room`, `game`, `reject`, `timer`, `notice`, `error`, `pong`.
  `PROTOCOL_VERSION`, `ENGINE_VERSION` and the `contentHash` must match (the server plays base
  content only, so a modded client is refused).
- **Server-authoritative.** Clients send `Action`s; the server validates with `validateAction`,
  applies, and sends each client its seat's full `viewFor(state, seat)` plus the events filtered by
  `eventsForSeat` (no hash-based resync: every update is a full view).
- **Seed secrecy:** the engine seed is `seed + "\u0000" + salt`; views carry no seed until game
  over, when the salt is revealed.
- The server (`driver.ts`) paces automated phases (1× playback budget, capped at 6 s), runs bots
  in-process and the decision timers; `rooms.ts` handles seats, Ready, host migration, late joiners,
  `reconnect_grace` and Warden stand-ins; `persist.ts` saves each running game's action log to
  `server/data/` so a restarted server resumes it.
- Rooms: 4-letter codes from `BCDFGHJKMNPQRSTVWXZ`. Lobby: claim seat, ready, host edits config.
- `npm run server` serves the built client (`dist/`) and the WebSocket endpoint `/ws` on one port
  (default 8787; env `PORT`, `HOST`, `WICKWATCH_DIST`, `WICKWATCH_DATA`); `npm start` builds first.
  The Vite dev server proxies `/ws` to 8787.

## 8. Coding rules

- TypeScript strict; avoid `any` (use `unknown` + narrowing). No `// @ts-ignore`.
- Small pure functions; no module-level mutable state in the engine (content registry is set once).
- Every engine module gets unit tests in `tests/unit/engine/*.test.ts`.
- UI: function components + hooks; CSS in `.css` files co-located or in `theme.css` (CSS custom
  properties from the palette). No inline style objects for static styling (dynamic transforms ok).
- Performance (GDD §16.10): CSS transforms/opacity for looping motion, no animated SVG filters,
  ≤ 300 particles, one darkness canvas, one particle canvas.
- Accessibility: every state has a shape as well as a colour; `reduced_motion` honoured;
  buttons are real `<button>`s with labels; keyboard shortcuts per GDD §15.7.
- Commit-ready code only: `npm run typecheck`, `npm test` and `npm run build` must pass.

## 9. Build, packaging and CI

- **Chunks** (`vite.config.ts`): the entry chunk holds the shell, Title, hero picker, Settings,
  the content registry, art and audio; `react-vendor` is React; the game screen (engine runtime,
  controller, board, FX), Setup, the lobby, How to Play and the Codex are lazy chunks
  (`src/ui/app/lazyScreens.ts`), fetched when their screen opens, when a screen that leads to them
  shows, and in the background once the browser is idle. `bot.worker` is its own worker chunk.
  Import `src/net/session` / `protocol` (not the `src/net` barrel) from entry-chunk code: the
  barrel re-exports `NetTransport`, which pulls in the whole engine.
- **PWA-lite:** `public/manifest.webmanifest` + PNG icons (`npx tsx scripts/render-icons.ts`);
  no service worker. `base: './'` keeps the build portable (GitHub Pages, itch.io).
- **Docs:** `docs/RULES.md` tables are generated from content (`npx tsx scripts/rules-tables.ts`;
  `--check` in CI).
- **CI** (`.github/workflows/ci.yml`, push + pull_request, Node 22): `npm ci`, typecheck, docs check,
  `npm test`, `npm run build`; a second job installs Chromium and runs `npx playwright test`
  (the config builds and serves `vite preview`). `pages.yml` deploys `dist/` on pushes to `main`.

