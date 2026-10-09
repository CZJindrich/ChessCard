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
docs/                 GDD.md, ARCHITECTURE.md, RULES.md (player-facing rules)
src/
  engine/             PURE rules engine. No DOM, no React, no Math.random, no Date, no timers.
    types.ts          All shared engine types (state, config, actions, events, content schemas).
    rng.ts            mulberry32 + named streams (exists).
    index.ts          Public API (see §4). UI/server import ONLY from here (and types.ts).
    geometry.ts       Coordinates, distance, reading order, patterns, line of sight, area shapes.
    content.ts        Loads + validates content JSON into a typed registry; mod merging; contentHash.
    setup.ts          createGame, seats/heroes/houses, decks.
    sites.ts          Site generation (cathedral_of_tallow, soot_market, belfry_steps, the_waxworks)
                      and fixed maps (first_vigil, hollow_nave, last_flame_ring).
    phases.ts         Phase machine (`advance`), night/round flow, seat turns, claims.
    actions.ts        Player action validation + application (move, strike, relight, ...).
    combat.ts         Damage, death, kill credit, push/pull/swap/bump, statuses, Take.
    cards.ts          Card play, effect-op interpreter, Hero Powers, traits, Charms, Heirlooms.
    snuff.ts          Enemy targeting, movement (BFS), intents, Snuff Strike resolution, Plumes/rise.
    bosses.ts         Boss spawn, movement, phases, the 9 boss intents, CHECKMATE, Hunger.
    modes/vigil.ts    Dread, Candles, stars, Retry, Dawn, Chandlery, Tolls, Moth Die.
    modes/lastFlame.ts Gloam, Glory, Bounty, Truce, Haunting, respawn/elimination, end + placement.
    tutorial.ts       first_vigil scripted Night 1 (§15.2).
    preview.ts        previewSnuffStrike + per-tile danger map.
    bots/             Bot planners (apprentice/warden/elder), hint.
    log.ts            Human-readable log lines (absolute coordinates, first names).
  content/            Data files (JSON), one per registry in GDD Appendix A.1
                      (heroes.json, units.json, cards.json, enemies.json, bosses.json,
                      boss_intents.json, tolls.json, omens.json, heirlooms.json, sites.json, ...).
  config/             Presets, defaults, validation, settings code (WAX1:), presentation settings,
                      local profile (games played, unlock ladder). Pure TS, usable by server too.
  audio/              Procedural WebAudio SFX + music (DONE; see src/audio/index.ts).
  art/                Procedural SVG React components: pieces, bosses, tiles, runes, card faces,
                      sigils, icons, dice, scenery. Pure presentation, no engine logic.
  ui/                 React screens and components.
    App.tsx           Screen router (title, hero picker, setup, lobby, how-to-play, codex,
                      settings, game, chandlery, boss intro, victory/defeat).
    theme.css         Palette tokens (GDD §16.2), typography, base components.
    screens/          One file (or folder) per screen.
    game/             Game screen: board, pieces layer, intents layer, hand, rails, HUD, overlays.
    fx/               Canvas darkness + particle layers, screen shake, damage numbers.
  game/               Client-side game controller (NOT React): owns the current GameState,
                      dispatches actions (local engine or online server), queues engine events
                      for animation, paces automated phases, runs bots in a Web Worker.
  net/                Online client + protocol types (protocol.ts is shared with server/).
  main.tsx            Entry point.
server/               Node WebSocket server: rooms, lobby, authoritative engine, bots, timers.
tests/unit/           Vitest. Engine tests are the bulk.
tests/e2e/            Playwright smoke + flow tests.
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
createGame(config: GameConfig, opts?: { content?: ContentRegistry }): GameState
applyAction(state: GameState, action: Action): ApplyResult
  // ApplyResult = { ok: true; state: GameState; events: GameEvent[] }
  //             | { ok: false; reason: ReasonCode; params?: Record<string, string | number> }
validateAction(state: GameState, action: Action): Validation
pendingAutomation(state: GameState): null | { phase: PhaseId }   // an 'advance' is due
activeSeats(state: GameState): number[]        // seats allowed to act right now
legalMoves(state, pieceId): Pos[]               // move destinations (incl. chimney exits)
legalStrikes(state, pieceId): StrikeOption[]    // targets + damage/lethal/take/push previews
cardTargets(state, seat, cardUid): CardTargetInfo   // playable? reason, valid targets, preview
powerTargets(state, seat): CardTargetInfo
intentQueue(state): IntentView[]                // resolution order, with human text
dangerMap(state): Record<string, number>        // tile key -> incoming damage (preview)
previewSnuffStrike(state): { state: GameState; events: GameEvent[] }
planBotTurn(state, seat, level): Action[]       // full seat turn (ends with end_turn)
botChoice(state, seat): Action | null            // toll/draft/boon/carry_over/haunt/deploy picks
hint(state, seat): Action | null
viewFor(state, seat): GameState                  // hides others' hands (Last Flame) + deck order
getContent(): ContentRegistry
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
`useSyncExternalStore`):
- holds `state`, a queue of pending `GameEvent`s, and `animating` flag;
- `dispatch(action)`: local → `applyAction`; online → send to server; on success push events;
- auto-dispatches `advance` when `pendingAutomation(state)` and no animation is playing
  (pacing via presentation settings `enemy_turn_speed` / `animation_speed`);
- runs bot seats (Web Worker `src/game/bot.worker.ts` calling `planBotTurn`), dispatching their
  actions one at a time so they animate like a human's;
- exposes `selection` UI state (selected piece/card) separately from engine state.

## 7. Online (`server/` + `src/net/`)

- Server-authoritative. Clients send `Action`s; the server validates with `validateAction`,
  applies, and sends each client `viewFor(state, seat)` plus the event list (filtered: other
  seats' drawn card ids hidden in Last Flame).
- The server owns pacing of automated phases and runs bots and turn timers.
- Rooms: 4-letter codes from `BCDFGHJKMNPQRSTVWXZ`. Lobby: claim seat, ready, host edits config.
- `npm run server` serves the built client (`dist/`) and the WebSocket endpoint on one port
  (default 8787), so friends on a LAN can play with one command.

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
