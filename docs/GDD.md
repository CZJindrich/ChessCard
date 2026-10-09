# WICKWATCH — Game Design Document (final)

*A dark-fantasy chess-and-cards vigil. Living candles hold back the smoke until dawn.*

Version 1.0 · Status: locked for implementation · Repository: `ChessCard`

---

## Engineering summary

Every id is snake_case and unique across the whole registry. Appendix A.1 holds the full registry, and Appendix A.2 holds the schemas.

### Content ids

| Category | Count | Ids |
|---|---|---|
| **Heroes** | 4 | `sconce_paladin`, `moth_witch`, `lampwright`, `ember_duelist` |
| Hero Powers | 4 | `lantern_oath`, `flutterswap`, `castle`, `shadowstep` |
| Hero traits | 4 | `stalwart`, `mothmaker`, `quick_build`, `flourish` |
| Unit and enemy traits | 11 | `promotion`, `censer`, `shieldbearer`, `battering`, `webs`, `heavy`, `pop`, `twin_knives`; `crown`, `wax_pool`, `belch` |
| **Units** | 13 | `taper`, `taper_captain`, `wickhorse`, `incense_acolyte`, `sconce_squire`, `brass_ram`, `velvet_moth`, `silkspinner`, `lantern`, `wick_mortar`, `bellows_golem`, `cinderling`, `twinwick` |
| **Cards: neutral** | 12 | `spark`, `light_a_taper`, `mend_the_wick`, `quickwick`, `beeswax_seal`, `saddle_the_wickhorse`, `ordain_an_acolyte`, `flare`, `rally_the_captain`, `turnabout`, `kindle_hope`, `dawnbreak` |
| **Cards: Paladin** | 7 | `shield_bash`, `waxen_ward`, `call_the_squire`, `sunshield_charge`, `muster_the_ram`, `oath_of_tallow`, `aegis_of_dawn` |
| **Cards: Witch** | 7 | `loose_a_moth`, `velvet_pull`, `moth_dust`, `cocoon`, `spin_the_silk`, `moonlit_hex`, `swarm_of_wings` |
| **Cards: Lampwright** | 7 | `tinder_bolt`, `hang_a_lantern`, `trim_the_wicks`, `prime_the_mortar`, `lens_of_brass`, `stoke_the_golem`, `grand_illumination` |
| **Cards: Duelist** | 7 | `strike_a_cinder`, `feint`, `searing_edge`, `hire_a_twinwick`, `ember_waltz`, `riposte`, `crimson_finale` |
| **Enemies** | 13 | `sootling`, `gnawmoth`, `smokehound`, `ink_wretch`, `hush_monk`, `ash_deacon`, `knell_banshee`, `gutter_pawn`, `drip_hulk`, `snuffer_knight`, `hollow_lamplighter`, `smokestack`, `clapper` |
| **Bosses** | 3 | `hush_hierophant`, `guttered_king`, `nocturna` |
| Boss intents | 9 | `bell_drop`, `hushwave`, `silencing_peal`, `ladle_slam`, `sceptre_sweep`, `wax_spit`, `wing_gust`, `hunger`, `dust_storm` |
| **Events: Tolls (Blessings)** | 5 | `candlemas_blessing`, `lucky_wick`, `hearthwind`, `peddler_of_wicks`, `moth_migration` |
| **Events: Tolls (Curses)** | 9 | `soot_fog`, `bell_of_embers`, `waxen_rain`, `ill_omen`, `crumbling_nave`, `restless_soot`, `shifting_chimneys`, `muffled_nave`, `black_sun` |
| **Events: Moth Die faces** | 6 | `eclipse` (1), `smoke` (2), `stillness` (3), `long_shadows` (4), `kindling` (5), `bright_wings` (6) |
| **Tiles** | 6 | `flagstone`, `pillar`, `rubble`, `votive_shrine`, `chimney`, `hot_wax` |
| Overlays and structures | 4 | `gloam`, `gloam_warning`, `vigil_candle`, `smoldering_wick` |
| Tokens | 5 | `smoke_plume`, `lit_shrine`, `first_light`, `crown_socket`, `bounty_seal` |
| Statuses | 3 | `ward`, `burn`, `dazed` |
| Heirlooms | 6 | `ever_burning_wick`, `brass_thimble`, `lamplighters_hook`, `moth_velvet_cloak`, `candlemakers_mold`, `bell_of_saint_tallow` |
| Boons | 3 | `heirloom`, `temper`, `prune` |
| Sites and maps | 7 | Sites: `cathedral_of_tallow`, `soot_market`, `belfry_steps`, `the_waxworks`. Maps: `first_vigil`, `hollow_nave`, `last_flame_ring` |

Other registries (modes, difficulties, lengths, Houses, bots, ranks, runes, phases, actions, area shapes, effect ops, reason codes, RNG streams) are listed in Appendix A.1.

### Config parameters (rules; included in the settings code, §14.1)

| Key | Default | Range |
|---|---|---|
| `mode` | `vigil` | `vigil`, `last_flame` |
| `seats` | 1 human | Vigil 1–4; Last Flame 2–4. Each seat is `human` or a bot (`bot_apprentice`, `bot_warden`, `bot_elder`) |
| `length` | `short` | `short`, `standard`, `long` |
| `difficulty` | `dusk` | `candlelit`, `dusk`, `midnight`, `witching_hour` |
| `boss_choice` | `random` | `random`, `hush_hierophant`, `guttered_king`, `nocturna` |
| `board_size` | `auto` | Vigil `auto` only; Last Flame `10x10` (2–3 seats), `12x12` (3–4 seats) |
| `nights` | from `length` | 2–8 (Boss Night included) |
| `turns_per_night` | 4 | 3–6 |
| `boss_rounds` | from `length` | 3–8 (Last Flame only) |
| `flame_per_turn` | 3 | 2–5 |
| `hand_size` | 5 | 4–7 |
| `unit_limit` | 4 | 2–6 |
| `tolls` | `on` | `on`, `off` |
| `moth_die` | `on` | `on`, `off` |
| `boons` | `on` | `on`, `off` |
| `retry_night` | from `difficulty` | `on`, `off` (Vigil only) |
| `starting_dread` | from `difficulty` | 0–6 (Vigil only) |
| `dread_max` | from `difficulty` | 8–16 (Vigil only) |
| `initial_enemies_mod` | from `difficulty` | −2 to +2 |
| `plumes_mod` | from `difficulty` | −2 to +2 |
| `enemy_hp_mod` | from `difficulty` | `none`, `non_minions`, `all` |
| `boss_hp_multiplier` | from `difficulty` | 0.50–2.00 in steps of 0.05 |
| `heal_between_nights` | from `difficulty` | 0–8 |
| `extra_smokestack` | from `difficulty` | `on`, `off` |
| `turn_timer` | `off` offline, `normal` online | `off`, `slow` (150 s), `normal` (90 s), `fast` (45 s) |
| `respawn_before_boss` | `on` | `on`, `off` (Last Flame only) |
| `neutrals` | `normal` | `off`, `normal`, `swarm` (Last Flame only) |
| `truce` | `night_1` | `off`, `night_1`, `nights_1_2` (Last Flame only) |
| `bounty` | `on` | `on`, `off` (Last Flame only) |
| `haunting` | `on` | `on`, `off` (Last Flame only) |
| `seed` | `random` | `random`, any text (1–32 characters), `daily` |

**Host options** (not in the settings code, §14.5): `hot_seat_privacy` (`on`), `reconnect_grace` (120 s, 30–600 s).
**Presentation settings** (per device, §14.4): `animation_speed`, `enemy_turn_speed`, `reduced_motion`, `screen_shake`, `bold_outlines`, `readable_font`, `ui_scale`, `confirm_end_turn`, `tutorial_hints`, `master_volume`, `sfx_volume`, `music_volume`, `mute`.

### Notes for the existing code
- `src/engine/rng.ts` provides one mulberry32 generator and an FNV-1a `seedFromString`. Keep both, and add named streams (Appendix B.3): one mulberry32 state per stream, each seeded with `seedFromString(seed + "\u0000" + stream)`.
- `src/audio` already ships the sound effects and the generative music. §16.11 and §16.12 map game events to the existing `SfxName` and `MusicMood` values. The audio defaults in `src/audio/settings.ts` (master 80%, SFX 90%, music 60%) are the presentation defaults in §14.4.
- `@fontsource/cinzel`, `@fontsource/cinzel-decorative` and `@fontsource/im-fell-english` are installed. Add `@fontsource/eb-garamond` for rules text (§16.3).

---

## 1. Vision, Setting and Pillars

### 1.1 Pitch
**Wickwatch** is a turn-based 2D tactics game for 1–4 players. Chess-style pieces fight on a stone chequer, and each player plays cards from a small deck to summon units, cast rites and attach charms. Every enemy shows its attack on the board before you act, so each turn is a readable puzzle: kill it, push it, block it or step out of the red.

- **Vigil** (co-op, 1–4 players, solo included): survive a run of Nights and slay a boss on the final Night.
- **Last Flame** (battle royale, 2–4 players): race for Glory while a smoke ring closes in, then fight a boss that attacks everyone.

### 1.2 Houses and player colours
Each seat belongs to a candle-making House. The House is assigned by seat (there is no picker), and its colour is that player's colour everywhere: piece bases, halos, plaques and pings.

| Seat | Id | House | Colour | Glyph |
|---|---|---|---|---|
| 1 | `house_beeswax` | House Beeswax | `#E09A2D` (amber) | Bee |
| 2 | `house_tallow` | House Tallow | `#E6D9B8` (ivory) | Drop |
| 3 | `house_bayberry` | House Bayberry | `#7FAF5A` (sage) | Berry sprig |
| 4 | `house_rushlight` | House Rushlight | `#5B8DEF` (rush blue) | Reed |

### 1.3 The world of Sconcewick
Sconcewick is a cathedral city of living candles, the **Wickfolk**, under the pale **Moth-Moon**. Every night the **Snuff** pour out of the chimneys and gutters: smoke-creatures that want to put out every light. The city's **Lanternwardens** keep the **Vigil**. They guard the **Vigil Candles** until dawn, because if enough lights die, the **Long Night** falls and never ends.

When there is no common enemy, the great Houses settle old feuds with the **Trial of the Last Flame**. Their champions fight inside a ring of **Gloam**, a smoke wall that tightens every night, until a monster rises from the smoke at its centre.

**Naming rules for content**
- Chess-piece names go only on pieces that move like that piece.
- Wickfolk names use the prefixes Wick-, Taper-, Lamp-, Brass-, Sconce- and Candle-.
- Snuff names use Soot-, Smoke-, Ash-, Hush-, Gutter-, Drip-, Gnaw- and Ink-.

### 1.4 Design pillars
1. **Readable in one glance.** Chess movement that players already know, enemy attacks that are always shown, red only for danger.
2. **Easy to jump in.** One click to play, a scripted first turn that always ends in a double kill, and systems that unlock over the first games.
3. **A board game on a screen.** A dice roll every round (the Moth Die), event cards every Night (Tolls), decks, a draft, tokens, victory points (Glory) and a first-player marker (First Light).
4. **A climax every game.** The last Night is always a boss fight.
5. **Configurable.** Every rule number in §14 is a parameter. Settings can be shared as a code.

---

## 2. Rules at a Glance

### 2.1 The 8 rules
These are shown on the How to Play screen, each with a small animated diagram.

1. **Survive the Night.** In Vigil, keep the Vigil Candles lit. Each Candle hit adds Dread, and when Dread is full the Long Night falls. The last Night is the Boss Night: slay the boss to win. In Last Flame, earn the most Glory before the last Night ends.
2. **Every round has three beats.** **Snuff Move** (enemies move and paint red danger tiles) → **your turns** → **Snuff Strike** (the red tiles are hit). Then Plumes rise and the round is tallied.
3. **Each piece may Move once and Strike once, in either order.** Pieces move like chess pieces. The rune on a piece's base shows how.
4. **Melee pieces strike where they could move, and a melee kill takes the square.** Ranged pieces shoot along lines and stay put. Pawns are the exception: they move straight and strike diagonally.
5. **Cards cost Flame.** Each turn you get 3 Flame and draw up to 5 cards. Summons bring new pieces, which act from your next turn. Rites happen at once. Charms attach to a piece.
6. **Red tiles are promises.** Every enemy attack is locked in before you act. Kill the attacker, push it, pull it, or step out of the red. An attack aimed by an enemy moves with that enemy.
7. **Violet spirals are Smoke Plumes.** An enemy rises from each one after the Snuff Strike. Stand on it to block it (you take 1 damage), or strike it to pop it.
8. **Fallen heroes smolder.** A hero at 0 HP becomes a Smoldering Wick. An adjacent ally can relight it by using its Strike.

### 2.2 Glossary
| Term | Meaning |
|---|---|
| Round | One full loop: Moth Die, Snuff Move, players, Snuff Strike, Rise, Tally. The UI shows "Round t/T". |
| Seat turn | One seat's activation inside the players phase. |
| Night | `turns_per_night` rounds (4 by default). The Boss Night is the last Night. |
| Ready / Spent | A piece with an unused Move or Strike is Ready. A piece that has used both is Spent. |
| Exhausted | A piece that arrived this round. It has no actions until its owner's next seat turn. |
| Take | After a melee kill, the striker moves onto the victim's tile. This is automatic and does not use the Move. |
| Intent | A locked enemy attack, drawn as red tiles. |
| Flame | Card currency. It refills at the start of each of your seat turns. |
| Dread | Vigil loss track, shown on the Hour Candle. |
| Glory | Last Flame score. |
| Gloam | The closing smoke ring in Last Flame. |
| Toll | The Night's event card. |
| Moth Die | The six-sided die rolled at the start of every round. |
| First Light | The first-player token. |
| Wickfolk / Snuff | The candle side / the smoke side. |
| Adjacent | One of the 8 neighbouring tiles, unless the text says *orthogonally adjacent*. |
| Within N | Chebyshev distance ≤ N (§5.1). |

---

## 3. Modes

### 3.1 Vigil ("team up against the Snuff")
- 1–4 seats. Any seat can be a human (local or online) or an AI ally.
- Everyone shares Dread and the Vigil Candles. Everyone wins or loses together.
- The run is `nights` Nights long. The last one is the Boss Night against one of 3 bosses.
- Score: 1–3 stars (§13.1.6).

### 3.2 Last Flame ("every candle for itself")
- 2–4 seats, at least 1 human. The other seats are bots.
- Each player has a hero, a deck and units. Neutral Snuff roam the board.
- The Gloam closes ring by ring. On the last Night a boss rises in the centre and attacks everyone.
- Score: Glory (§13.2.2). The highest final Glory wins.

### 3.3 Seats and heroes
- Heroes are unique within a game. Bots pick from the heroes nobody has picked, using the `setup` stream.
- Houses are assigned by seat (§1.2).

---

## 4. The Night and the Round

### 4.1 Phase machine
```
game:
  for each Night n = 1 .. N:
    night_setup          (actions: deploy, ready)
    boss_intro           (Boss Night only)
    toll                 (Nights 2 .. N-1, when tolls = on; action: choose_toll)
    repeat for each round t = 1 .. T:
      omen               (when moth_die = on)
      snuff_move
      players            (actions: move, strike, relight, light_shrine, play_card, use_power,
                          free_action, undo, claim_turn, end_turn)
      snuff_strike
      rise
      tally              (action: haunt)
    dawn                 (regular Nights only; action: carry_over)
    chandlery            (regular Nights only; actions: draft_pick, skip_pick, boon_pick)
  game_over
```
- `N` = `nights`. Regular Nights are Nights 1 to N−1. The Boss Night is Night N.
- `T` = `turns_per_night` on regular Nights. On the Boss Night: Vigil has no cap (the Night ends when the boss dies or Dread is full), and Last Flame uses `boss_rounds`.
- `game_over` is entered at once on Vigil victory or defeat, or at the Last Flame end conditions (§13.2.9).
- The automated phases (`omen`, `snuff_move`, `snuff_strike`, `rise`, `tally`, `dawn`) are stepped by the system action `advance`.

### 4.2 What happens in each phase
| Phase | Steps |
|---|---|
| `night_setup` | **Vigil:** build the Night's site (§13.3) with its 3 Vigil Candles, auto-deploy heroes and kept units, and let players drag their own pieces inside the deploy zone, then press Ready (20 s timer online). **Last Flame:** Night 1 builds `last_flame_ring` and places heroes on their start tiles (they may be dragged to a tile within 1, then Ready); on later Nights every piece stays where it is. **Both modes:** place initial enemies and the first Plumes, then shuffle every deck in full and draw `hand_size` cards. |
| `boss_intro` | Boss spawn and the 4-second intro screen (§15.1). |
| `toll` | Reveal 1 Blessing and 1 Curse. The chooser picks one (§13.4). |
| `omen` | Roll the Moth Die and apply the face (§13.5). |
| `snuff_move` | Bosses first, then enemies in initiative order. Each one moves (§12.2) and then declares its intent (§12.3). Risers that rose last round declare too. |
| `players` | Seat turns (§11.2). |
| `snuff_strike` | Resolve intents one at a time, in queue order (§6.8). |
| `rise` | Plumes rise in creation order (§9.4). |
| `tally` | The fixed Tally order (§6.9). |
| `dawn` | All Snuff and Plumes vanish. Then Dawn Dread recovery (Vigil), Smoldering heroes relight, heal between Nights, carry-over, hands are discarded and Charms return to the discard pile (§13.6). |
| `chandlery` | Card draft and Boon (§13.6). |

### 4.3 Seat turn
**At the start of your seat turn:**
1. Draw until you hold `hand_size` cards (5).
2. Set your Flame to `flame_per_turn` (3), plus any bonus.
3. Your pieces become Ready, except Exhausted ones (summoned since your last seat turn).

**During your seat turn,** do any of these in any order: move and strike with Ready pieces, play cards, use your Hero Power once, use free actions.

**At the end of your seat turn,** unspent Flame is lost and "this turn" effects end.

### 4.4 Plume schedule
Plumes are placed at `night_setup` and at the Tally of rounds 1 to T−2. That way every Plume rises in a round the Night still has to play.

Example with T = 4: Plumes are placed at setup, Tally 1 and Tally 2, and rise in rounds 1, 2 and 3. On the Vigil Boss Night, which has no cap, Plumes are placed at every Tally.

---

## 5. Board, Geometry and Movement

### 5.1 Coordinates and distance
- Files are a–l and ranks 1–12, absolute. Rank 1 is the host's bottom edge.
- Clients may rotate their view, but the log, intent text ("c3 Vigil Candle") and reason strings always use absolute coordinates.
- **Distance** is Chebyshev distance: max(|Δfile|, |Δrank|). For multi-tile pieces, use the minimum over the footprint.
- **Reading order** is rank descending, then file ascending (a8, b8, … h8, a7, …).
- **Board sizes:** Vigil uses 8×8 for 1–2 seats and 10×10 for 3–4 seats. Last Flame uses 10×10 for 2–3 seats and 12×12 for 3–4 seats.

### 5.2 Movement patterns and runes
Each piece's base shows its movement rune on the left. Pieces whose strike is not "as move" also show a strike glyph on the right.

| Rune id | Name | Pattern | Example pieces |
|---|---|---|---|
| `rune_crown` | King step | Step 1 in any of the 8 directions | Brannoc, Taper Captain, Sconce Squire, Silkspinner, Sootling |
| `rune_horse` | Knight leap | Jump to one of the 8 (1,2)/(2,1) offsets, ignoring pieces in between | Velveteen, Wickhorse, Snuffer Knight |
| `rune_tower` | Rook slide | Slide orthogonally up to N tiles (N is shown as pips) | Wicklow (3), Brass Ram (2), Ink Wretch (2) |
| `rune_mitre` | Bishop slide | Slide diagonally up to N tiles | Vey (3), Incense Acolyte (2), Twinwick (2), Knell Banshee (3) |
| `rune_star` | Queen slide | Slide in any of the 8 directions up to N tiles | Velvet Moth (2), Cinderling (2), Smokehound (2), Gnawmoth (3) |
| `rune_pawn` | Pawn | Moves 1 orthogonally in any direction, strikes 1 diagonally in any direction | Taper, Gutter Pawn |
| `rune_wing` | Flying | Added to a slide: passes over pieces and obstacles and lands on an enterable empty tile; ignores Rubble and Hot Wax while passing | Velvet Moth, Gnawmoth, Knell Banshee, Nocturna |
| `rune_arc` | Artillery | Strike glyph: hits a tile within a min–max distance, ignoring line of sight | Wick Mortar, Ash Deacon |
| `rune_bolt` | Ranged line | Strike glyph: shoots along a line and hits the first piece | Wicklow, Lantern, Silkspinner, Ink Wretch |
| `rune_anchor` | Immobile | Cannot move | Lantern, Wick Mortar, Smokestack, Vigil Candle |

**Movement rules**
- A **step** or **slide** needs every tile on its path to be empty and enterable. The destination must be empty and enterable.
- A non-flying slide that enters Rubble stops there.
- A **leap** ignores the tiles in between. The landing tile must be empty and enterable.
- `range: null` means "to the board edge".
- A rook or bishop rune with 1 pip is a single orthogonal or diagonal step (Hush Monk, Drip Hulk, Bellows Golem).
- Summons can never be placed on a Smoke Plume tile (§9.4). Moving onto a Plume is allowed: that is how you block it.

### 5.3 Line of sight
- Ranged and line attacks trace the exact orthogonal or diagonal line. Diagonal lines check only the tiles on the diagonal, as in chess.
- **Blockers:** any piece of any side (Vigil Candles, Smoldering Wicks and structures included), Pillars, and boss footprints.
- **Not blockers:** Rubble, Smoke Plumes, Hot Wax, Gloam, Votive Shrines and Chimneys.
- `firstHit` lines stop at the first blocker and hit it if it is a piece. Smoke Plumes do not stop them. A player may instead choose a Plume that lies before the first blocker, which pops the Plume and stops the line.
- `pierce` lines hit every piece on the line up to their range. Only Pillars stop them.
- Artillery ignores line of sight but respects `minRange`.
- Cards need no line of sight unless they say "in a straight line".

### 5.4 Tiles
| Id | Enterable | Ends slides | Blocks LOS | Effect | Snuff AI cost | Light radius |
|---|---|---|---|---|---|---|
| `flagstone` | Yes | No | No | None | 1 | 0 |
| `pillar` | No | — | Yes | None. Not damageable. | — | 0 |
| `rubble` | Yes | Yes (non-flying) | No | None | 2 | 0 |
| `votive_shrine` | Yes | No | No | A Wickfolk piece on or adjacent to an unlit Shrine may spend its Strike to light it (`light_shrine`). A Lit Shrine heals 1 HP to each Wickfolk piece on or adjacent to it at Tally. A Snuff that ends a move on a Lit Shrine, or a Snuff attack that covers its tile, puts it out. In Last Flame, lighting one gives +1 Glory. | 1 | 1.5 (3 when lit) |
| `chimney` | Yes | — | No | Comes in pairs, each pair with its own glyph. A voluntary Move by a Wickfolk piece that enters a Chimney ends on the paired Chimney. This is legal only if the pair is empty. No chaining. Snuff, bosses, pushes, pulls, swaps, Takes and card moves never use Chimneys; for them it is a flagstone. | 1 | 0 |
| `hot_wax` | Yes | No | No | 1 damage to a non-flying, non-immune piece that **ends** any movement on it (move, push, pull, swap, Take, card move), and 1 more at each Tally while it stays there. Sliding through does nothing. | 4 (1 if immune) | 0 |

**Overlays and structures**
| Id | Rule |
|---|---|
| `gloam` | Last Flame only. Enterable. A Wickfolk piece that ends a Tally in Gloam takes 2 damage, and Ward does not apply. Snuff and bosses are immune. When Gloam covers a tile: Plumes, Lanterns, Wick Mortars and Smokestacks there are removed, a Lit Shrine goes dark (and cannot be lit while in Gloam), a Chimney whose pair is in Gloam stops working, and a Smoldering Wick there means elimination. Plumes are never placed in Gloam. |
| `gloam_warning` | Marks the ring that closes at this round's Tally. Shown from the start of that round. |
| `vigil_candle` | Vigil structure. 3 HP, immobile, immune to displacement. Blocks movement and line of sight. Can receive Ward and healing. At 0 HP it is snuffed and removed. |
| `smoldering_wick` | Left by a fallen hero. Blocks movement but not line of sight. Can be damaged only by Gloam. |

---

## 6. Actions and Combat

### 6.1 The action economy
- Each Ready piece gets **one Move and one Strike** per seat turn, in either order. Two pips on its base (a boot and a sword) empty separately. When both are empty, the piece is Spent and dims.
- Cards and Hero Powers never use a piece's Move or Strike.
- Extra Moves and extra Strikes from cards and traits add pips for this seat turn.
- Pieces summoned or created during a round arrive Exhausted. The exception is Lanterns and Wick Mortars summoned by Wicklow (`quick_build`).

### 6.2 Strikes
| Kind | Targets | After a kill |
|---|---|---|
| **Melee, as move** | Any enemy the piece could reach by its movement pattern if that tile were empty. Slides need a clear path up to the target. | **Take**: the striker moves onto the tile automatically. |
| **Melee, pawn** | Any enemy one diagonal step away. | Take. |
| **Ranged line** | The first piece on a line within range (§5.3). | The striker stays put. |
| **Artillery** | Any tile within `minRange`–`range`, ignoring line of sight. | The striker stays put. |

- A strike deals the piece's ATK in damage, plus any modifiers.
- The striker can also target a Smoke Plume tile it could reach. This pops the Plume, and there is no Take.
- **No Take** happens when the striker is immobile, when the target is multi-tile, or for Velveteen (`mothmaker`).
- A Take that ends on Hot Wax triggers the wax.

### 6.3 Damage, death and kill credit
- Damage is applied one instance at a time. A piece at 0 HP dies at once: Wickfolk melt, Snuff burst, and heroes become Smoldering Wicks (in Last Flame they may be eliminated instead, §13.2.6).
- **Kill credit:** the player whose action caused the damage, including bumps and Hot Wax within that action.
  - A kill dealt by the Snuff is credited to the last player who displaced (push, pull, swap) the attacker or the victim this round, or who reversed the attacker's intent. If nobody did, nobody gets credit.
  - The engine tracks this with `lastDisplacedBy`, which resets at the start of each round.
  - All deaths from one effect are credited to the same player and logged in reading order.

### 6.4 Push, pull, swap and bump
- **Direction** is (sign Δfile, sign Δrank) from the source to the target. For a multi-tile source, measure from its nearest footprint tile.
- **Push:** the piece moves tile by tile. At the first blocked tile (a piece, Pillar, Vigil Candle, Wick or the board edge), the pushed piece takes **bump 1** and stops. If the blocker is a piece, it also takes bump 1. The rest of the distance is lost.
  - Plumes and Gloam do not block. Hot Wax applies when the push ends on it.
  - In Last Flame during a truce, a push that would bump a rival piece stops one tile short instead.
- **Pull** is a push toward the source. It stops adjacent to the source.
- **Swap** exchanges two pieces' tiles.
- Immune to push, pull and swap: multi-tile pieces, structures (Vigil Candles, Lanterns, Wick Mortars, Smokestacks, Wicks) and `heavy` pieces. The one exception is Wicklow's own `castle`.
- Immune to push and pull only: `stalwart` pieces (they can still be swapped).

### 6.5 Statuses
| Id | Rule |
|---|---|
| `ward` | At most 1. Cancels one whole damage instance (bump, Plume block and Hot Wax included), then breaks. Does not stop Gloam damage or Checkmate damage. Previews show the absorption. |
| `burn` | 1 damage at Tally, for 2 Tallies. Does not stack. Reapplying it resets the count to 2. |
| `dazed` | On a Wickfolk piece: its next Strike is lost (the sword pip empties). On a Snuff with a locked intent: that intent is cancelled and removed from the board at once. On a Snuff without an intent: it declares none at the next Snuff Move. On a boss: its last intent in the queue is cancelled. Dazed then clears. |

### 6.6 Free actions and special actions
| Action | Rule |
|---|---|
| `relight` | Vigil only. Uses the Strike of an allied Wickfolk piece adjacent to a Smoldering Wick. The hero returns at the end of that seat turn on the Wick's tile with ⌈max HP/2⌉ HP, Exhausted. |
| `light_shrine` | Uses the Strike of a Wickfolk piece on or adjacent to an unlit Votive Shrine. The Shrine stays lit until Dawn or until it is put out. |
| `free_action: melt` | Dismiss one of your units. It is removed, and no credit is given. |
| `free_action: ring_bell` | `bell_of_saint_tallow` only. Once per Night: Daze an enemy within 4 of your hero. |
| `use_power` | The hero's power. Costs Flame, once per seat turn, and not while Smoldering. |

### 6.7 Multi-tile pieces (bosses)
- A boss's position is its **anchor**: the lowest file and lowest rank of its 2×2 footprint.
- A boss is one target. Each effect instance hits it at most once.
- Adjacency and distance use the closest footprint tile. A melee strike reaches a boss if the pattern reaches any footprint tile.
- Its footprint blocks line of sight. Artillery may aim at any footprint tile.
- There is never a Take against a multi-tile piece.

### 6.8 Resolving the Snuff Strike
1. Intents resolve **one at a time, in queue order**: boss intents first (in their listed order), then enemy intents by initiative.
2. Each intent fully finishes before the next starts: damage → push → bumps → deaths → Dread.
3. If an attacker has died, its intents are cancelled.
4. **Aimed intents:** an intent stores its attacker id, shape, direction and offset from the attacker. At strike time, its tiles are recomputed from the attacker's current position, and `firstHit` lines are retraced.
   - Parts that fall off the board fizzle.
   - `reverse_intent` negates the direction. Artillery mirrors its offset through the attacker. Intents centred on the attacker cannot be reversed (reason `NO_DIRECTION`).
5. Snuff attacks hit every piece on their tiles, Snuff included (friendly fire). Bosses are never hit by Snuff attacks. Snuff attacks never pop Plumes.
6. Win and loss are checked after every atomic effect (§13.1.5).
7. The queue display order equals the resolution order. `previewSnuffStrike` runs this same code on a cloned state.

### 6.9 Tally order
1. Gloam closes, if scheduled (Last Flame).
2. Burn damage on Snuff.
3. Burn damage on Wickfolk.
4. Hot Wax damage (pieces still standing on it).
5. Gloam damage (Last Flame).
6. Heals: Lit Shrines, Incense Acolytes, `cocoon`, `hearthwind`.
7. Vigil self-relight (§13.1.3).
8. Boss toll: Dread +1 (Vigil Boss Night only).
9. End-of-round checks: Last Flame boss rounds and standing heroes.
10. Plume placement: regular Plumes, Smokestack Plumes and Haunt Plumes (§9.4, §13.2.7).
11. First Light passes (Last Flame).

### 6.10 Undo
- You can undo only your own actions in the current seat turn.
- Anything that revealed information or used randomness is a commit point: card draws, shuffles, and effects that create Plumes. Undo stops there.
- In co-op, undo never crosses another player's committed action.
- Undoing a kill also removes the Flourish strike it granted.

---

## 7. Cards, Deck and Flame

### 7.1 Card rules
- **Types:**
  - **Summon** (gold frame): puts a unit on an empty, enterable, non-Plume tile within 2 of your hero. The unit is Exhausted.
  - **Rite** (ember frame): an instant effect.
  - **Charm** (verdigris frame): attaches to a piece until Dawn, or until the piece leaves play. Each piece holds at most 1 Charm, and a new Charm replaces the old one. A Charm that leaves play goes to the discard pile.
- **Range** "within N" counts from your hero. While your hero is Smoldering, these cards cannot be played (reason `HERO_SMOLDERING`). Board-wide cards can still be played.
- **Flame:** `flame_per_turn` (3) at the start of each of your seat turns. You can hold at most 6; anything above that is lost. Unspent Flame is lost at the end of your seat turn.
- **Hand:** draw up to `hand_size` (5) at the start of each seat turn. The hand limit is 8; draws at 8 are skipped and the card stays on the deck.
- **Deck:** when you need to draw from an empty deck, shuffle your discard pile into it (your `decks:<seat>` stream). If both are empty, the draw fizzles. There is no fatigue.
- **Unit limit:** `unit_limit` (4) non-hero Wickfolk pieces per seat. Structures and Moths count. A summon at the limit is unplayable (`UNIT_LIMIT`). Auto-created units (Mothmaker, `moth_migration`) fizzle at the limit.
- **Card limit:** none by default. The Muffled Nave Toll sets 2, and Silencing Peal sets 1 for one players phase.
- **Tempered card** (the `temper` Boon): cost −1, minimum 0. Quickwick, which already costs 0, gives 2 extra Moves instead of 1. A card can be tempered once; it shows a brass rim and a "+" after its name.
- **Truce** (Last Flame): rival pieces cannot be chosen as targets, and area effects skip them.

### 7.2 Starting decks
Every deck has 10 cards: `spark` ×2, `light_a_taper` ×1, `mend_the_wick` ×1, plus the hero's 3 class starters ×2 each.

| Hero | Class starters (×2 each) |
|---|---|
| `sconce_paladin` | `shield_bash`, `waxen_ward`, `call_the_squire` |
| `moth_witch` | `loose_a_moth`, `velvet_pull`, `moth_dust` |
| `lampwright` | `tinder_bolt`, `hang_a_lantern`, `prime_the_mortar` |
| `ember_duelist` | `strike_a_cinder`, `feint`, `searing_edge` |

The minimum deck size is 8.

### 7.3 The 40 cards
"Hero" means your hero. "Within N" counts from your hero.

**Neutral (12)**
| Id | Name | Type | Cost | Rarity | Text |
|---|---|---|---|---|---|
| `spark` | Spark | Rite | 1 | Common | Deal 1 damage to an enemy or Smoke Plume within 3. |
| `light_a_taper` | Light a Taper | Summon | 1 | Common | Summon a Taper. |
| `mend_the_wick` | Mend the Wick | Rite | 1 | Common | Heal 2 HP to an allied piece or Vigil Candle within 3. |
| `quickwick` | Quickwick | Rite | 0 | Common | One of your pieces within 3 gets 1 extra Move this turn. |
| `beeswax_seal` | Beeswax Seal | Charm | 1 | Common | Attach to an allied piece within 3: +1 max HP and +1 HP. It gains Ward. |
| `saddle_the_wickhorse` | Saddle the Wickhorse | Summon | 2 | Common | Summon a Wickhorse. |
| `ordain_an_acolyte` | Ordain an Acolyte | Summon | 2 | Common | Summon an Incense Acolyte. |
| `flare` | Flare | Rite | 2 | Common | Choose a tile within 3. Deal 1 damage to every enemy in the 3×3 square centred on it, and pop every Plume there. |
| `rally_the_captain` | Rally the Captain | Summon | 2 | Rare | Summon a Taper Captain. |
| `turnabout` | Turnabout | Rite | 1 | Rare | Reverse the locked intent of an enemy within 4. |
| `kindle_hope` | Kindle Hope | Rite | 2 | Rare | Choose one: relight an allied Smoldering Wick within 3 now (⌈max HP/2⌉ HP, Exhausted), or heal an allied hero within 3 by 3 HP. |
| `dawnbreak` | Dawnbreak | Rite | 4 | Mythic | Pop every Smoke Plume on the board. Heal 1 HP to every allied piece and Vigil Candle. |

**Sconce Paladin (7)**
| Id | Name | Type | Cost | Rarity | Text |
|---|---|---|---|---|---|
| `shield_bash` | Shield Bash | Rite | 1 | Common | Deal 2 damage to an enemy adjacent to your hero and push it 2 tiles away from your hero. |
| `waxen_ward` | Waxen Ward | Rite | 1 | Common | Give Ward to an allied piece or Vigil Candle within 3. |
| `call_the_squire` | Call the Squire | Summon | 2 | Common | Summon a Sconce Squire (it arrives with Ward). |
| `sunshield_charge` | Sunshield Charge | Rite | 2 | Common | Your hero slides up to 3 tiles in a straight line (orthogonal or diagonal), following the slide rules (§5.2). Then deal 2 damage to one enemy adjacent to it. This does not use its Move. |
| `muster_the_ram` | Muster the Ram | Summon | 3 | Rare | Summon a Brass Ram. |
| `oath_of_tallow` | Oath of Tallow | Charm | 2 | Rare | Attach to your hero: +1 ATK, and its strikes push the target 1 tile away if it survives. |
| `aegis_of_dawn` | Aegis of Dawn | Rite | 3 | Mythic | Every allied piece and Vigil Candle gains Ward. Heal your hero 2 HP. |

**Moth Witch (7)**
| Id | Name | Type | Cost | Rarity | Text |
|---|---|---|---|---|---|
| `loose_a_moth` | Loose a Moth | Summon | 1 | Common | Summon a Velvet Moth. |
| `velvet_pull` | Velvet Pull | Rite | 1 | Common | Pull an enemy within 4 up to 3 tiles toward your hero. |
| `moth_dust` | Moth Dust | Rite | 2 | Common | Daze an enemy within 3. |
| `cocoon` | Cocoon | Charm | 1 | Common | Attach to an allied piece within 3: it heals 1 HP at every Tally. |
| `spin_the_silk` | Spin the Silk | Summon | 2 | Common | Summon a Silkspinner. |
| `moonlit_hex` | Moonlit Hex | Rite | 3 | Rare | Turn a Snuff Minion or Soldier within 3 into a Velvet Moth you own (Exhausted). Counts as a kill. Needs a free unit slot. Can't target Elites or Bosses. |
| `swarm_of_wings` | Swarm of Wings | Rite | 4 | Mythic | Summon up to 2 Velvet Moths. All your Velvet Moths are Ready this turn, including the new ones. |

**Lampwright (7)**
| Id | Name | Type | Cost | Rarity | Text |
|---|---|---|---|---|---|
| `tinder_bolt` | Tinder Bolt | Rite | 1 | Common | Deal 2 damage to the first enemy or Plume in a straight orthogonal line from your hero, up to 4 tiles. |
| `hang_a_lantern` | Hang a Lantern | Summon | 2 | Common | Summon a Lantern. |
| `trim_the_wicks` | Trim the Wicks | Rite | 1 | Common | Each of your Lanterns and Wick Mortars gets 1 extra Strike this turn. |
| `prime_the_mortar` | Prime the Mortar | Summon | 3 | Common | Summon a Wick Mortar. |
| `lens_of_brass` | Lens of Brass | Charm | 2 | Rare | Attach to one of your Lanterns or Wick Mortars (any distance): +1 ATK and +2 range. |
| `stoke_the_golem` | Stoke the Golem | Summon | 4 | Rare | Summon a Bellows Golem. |
| `grand_illumination` | Grand Illumination | Rite | 4 | Mythic | Each of your Lanterns deals 2 damage to every enemy in its 4 orthogonal lines, up to 4 tiles, passing through pieces (Pillars still block), and pops Plumes on those lines. |

**Ember Duelist (7)**
| Id | Name | Type | Cost | Rarity | Text |
|---|---|---|---|---|---|
| `strike_a_cinder` | Strike a Cinder | Summon | 1 | Common | Summon a Cinderling. |
| `feint` | Feint | Rite | 1 | Common | Swap your hero with an adjacent single-tile enemy. Its locked intent moves with it. |
| `searing_edge` | Searing Edge | Rite | 1 | Common | This turn, your hero's strikes deal +1 damage and apply Burn. |
| `hire_a_twinwick` | Hire a Twinwick | Summon | 2 | Common | Summon a Twinwick. |
| `ember_waltz` | Ember Waltz | Rite | 2 | Common | Swap your hero with one of your pieces within 3. Your hero gets 1 extra Strike this turn. |
| `riposte` | Riposte | Charm | 1 | Rare | Attach to your hero: whenever a Snuff attack or a rival strike damages your hero, deal 1 damage to the attacker. |
| `crimson_finale` | Crimson Finale | Rite | 3 | Mythic | This turn, your hero's strikes deal +1 damage, and Flourish can trigger up to 4 times. |

Rarity totals: 26 Common, 9 Rare, 5 Mythic.

---

## 8. Heroes and Units

### 8.1 Heroes
Heroes are shown at 1.2× scale with a halo sigil. HP carries over between Nights (§13.6).

| Id | Display name | HP | ATK | Move | Strike | Trait | Power (cost) |
|---|---|---|---|---|---|---|---|
| `sconce_paladin` | Brannoc, the Sconce Paladin | 8 | 2 | King step | Melee, as move | `stalwart`: cannot be pushed or pulled. | `lantern_oath` (2 Flame): Brannoc and every allied piece adjacent to him gain Ward. |
| `moth_witch` | Velveteen, the Moth Witch | 6 | 2 | Knight leap | Melee, as move (no Take) | `mothmaker`: a Snuff Minion or Soldier killed by her Strike becomes a Velvet Moth you own on that tile (Exhausted, if the unit limit allows). Never for rivals or bosses. | `flutterswap` (2 Flame): swap two single-tile, non-structure pieces within 3 of her. She may be one of them. |
| `lampwright` | Wicklow, the Lampwright | 6 | 2 | Rook slide 3 | Ranged line, orthogonal, range 4, `firstHit` | `quick_build`: his Lanterns and Wick Mortars arrive Ready. | `castle` (1 Flame): Wicklow swaps places with one of his Lanterns or Wick Mortars anywhere on the board. |
| `ember_duelist` | Vey, the Ember Duelist | 6 | 2 | Bishop slide 3 | Melee, as move | `flourish`: when her own Strike kills, she gets 1 extra Strike this seat turn (at most 2 per seat turn). | `shadowstep` (1 Flame): move Vey to an empty, enterable tile adjacent to an enemy within 4 of her. This does not use her Move. |

**Pitch lines** (hero picker)
- Brannoc: "Walks and strikes like a king. Shields his friends."
- Velveteen: "Leaps and strikes like a knight. Her kills become moths."
- Wicklow: "Slides like a rook and shoots down lines. Builds lanterns that shoot."
- Vey: "Slashes like a bishop. Every kill earns another strike."

**Name format:** "Brannoc, the Sconce Paladin" on cards and screens. Coach marks and the log use the first name only ("Brannoc").

### 8.2 Units
| Id | Name | HP | ATK | Move | Strike | Trait | Summon card |
|---|---|---|---|---|---|---|---|
| `taper` | Taper | 1 | 1 | Pawn: 1 orthogonal step | Pawn: 1 diagonal step, Take | **Promotion** (`promotion`): when its Strike kills, it becomes a Taper Captain with full HP. | `light_a_taper` |
| `taper_captain` | Taper Captain | 2 | 2 | King step | As move | — | `rally_the_captain` |
| `wickhorse` | Wickhorse | 2 | 2 | Knight leap | As move | — | `saddle_the_wickhorse` |
| `incense_acolyte` | Incense Acolyte | 2 | 1 | Bishop slide 2 | As move | **Censer** (`censer`): at Tally, heals 1 HP to each adjacent allied piece (not itself). | `ordain_an_acolyte` |
| `sconce_squire` | Sconce Squire | 3 | 1 | King step | As move | **Shieldbearer** (`shieldbearer`): arrives with Ward. | `call_the_squire` |
| `brass_ram` | Brass Ram | 4 | 2 | Rook slide 2 | As move | **Battering** (`battering`): a target that survives its Strike is pushed 2. | `muster_the_ram` |
| `velvet_moth` | Velvet Moth | 1 | 1 | Queen slide 2, flying | As move | — | `loose_a_moth` |
| `silkspinner` | Silkspinner | 2 | 1 | King step | Ranged line, 8 directions, range 3, `firstHit` | **Webs** (`webs`): its Strike applies Dazed. | `spin_the_silk` |
| `lantern` | Lantern | 2 | 1 | Immobile | Ranged line, orthogonal, range 4, `firstHit` | Structure. Light radius 3. | `hang_a_lantern` |
| `wick_mortar` | Wick Mortar | 2 | 2 | Immobile | Artillery, single tile, distance 2–4 | Structure. | `prime_the_mortar` |
| `bellows_golem` | Bellows Golem | 5 | 2 | 1 orthogonal step | Melee, orthogonally adjacent, Take | **Heavy** (`heavy`): cannot be pushed, pulled or swapped. Its Strike pushes 1 if the target survives. | `stoke_the_golem` |
| `cinderling` | Cinderling | 1 | 1 | Queen slide 2 | As move | **Pop** (`pop`): when it dies, it deals 1 damage to each adjacent enemy. | `strike_a_cinder` |
| `twinwick` | Twinwick | 2 | 1 | Bishop slide 2 | As move | **Twin Knives** (`twin_knives`): its Strike hits twice (2 instances of 1 damage). | `hire_a_twinwick` |

---

## 9. The Snuff

### 9.1 Ranks
| Rank | Glory (Last Flame) | Notes |
|---|---|---|
| `minion` | 1 | 1–2 HP fodder |
| `soldier` | 2 | |
| `elite` | 3 | |
| `structure` | 2 | Immobile |
| `boss` | §13.2.2 | Multi-tile |

**HP modifiers** (`enemy_hp_mod`):
- `non_minions`: +1 HP to soldiers, elites and structures.
- `all`: +1 HP to every non-boss enemy, boss summons and the Clapper included.
- They never apply to bosses or Plumes.

### 9.2 Enemies
| Id | Name | Rank | HP | ATK | Move | Attack (intent) | Prefers | Weight T1/T2/T3 | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `sootling` | Sootling | minion | 1 | 1 | King step | Melee, 1 adjacent tile | `candles` | 4/3/2 | |
| `gnawmoth` | Gnawmoth | minion | 1 | 1 | Queen slide 3, flying | Melee, 1 adjacent tile | `light` | 2/2/1 | |
| `smokehound` | Smokehound | soldier | 2 | 1 | Queen slide 2 | Melee, 1 adjacent tile, push 1 | `heroes` | 1/2/2 | |
| `ink_wretch` | Ink Wretch | soldier | 2 | 1 | Rook slide 2 | Line, orthogonal, range 4, `firstHit`, push 1 | `candles` | 2/2/1 | |
| `hush_monk` | Hush Monk | soldier | 3 | 1 | 1 orthogonal step | `ring8` around itself, applies Dazed | `heroes` | 0/2/2 | Centred: cannot be reversed |
| `ash_deacon` | Ash Deacon | soldier | 2 | 1 | King step | Artillery, `plus5` centred on a tile at distance 2–4 | `clusters` | 0/1/2 | |
| `knell_banshee` | Knell Banshee | elite | 4 | 2 | Bishop slide 3, flying | Line, diagonal, range 3, `pierce` | `heroes` | 0/0/1 | |
| `gutter_pawn` | Gutter Pawn | minion | 2 | 1 | Pawn: 1 orthogonal step | Pawn: 1 diagonal tile | `candles` | 0/0/0 | Guttered King summon. Immune to Hot Wax. **Crown** (`crown`, Vigil only): if it ends a Snuff Move on rank 1, it becomes a Drip Hulk at full HP. |
| `drip_hulk` | Drip Hulk | elite | 6 | 2 | 1 orthogonal step | Melee, 1 orthogonally adjacent tile, push 1 | `nearest` | 0/0/1 | Immune to Hot Wax. **Wax Pool** (`wax_pool`): when it dies, its tile becomes Hot Wax. |
| `snuffer_knight` | Snuffer Knight | elite | 4 | 2 | Knight leap | Melee, 1 knight-offset tile | `heroes` | 0/1/2 | |
| `hollow_lamplighter` | Hollow Lamplighter | elite | 5 | 2 | Rook slide 2 | Line, orthogonal, range 5, `firstHit` | `light` | 0/0/1 | |
| `smokestack` | Smokestack | structure | 4 | 0 | Immobile | None | — | 0/0/0 | **Belch** (`belch`): at each Plume placement, adds 1 Sootling Plume on a legal tile within 2 of itself. Placed by sites and by `extra_smokestack`. |
| `clapper` | The Clapper | elite | 5 | 2 | King step | `ring8` around itself | `heroes` | 0/0/0 | Hush Hierophant phase 3 summon. Centred. |

- Snuff never Take.
- An enemy's intent damage equals its ATK (plus Eclipse).
- Weight "T1/T2/T3" is the draw weight on Nights of tier 1/2/3 (§13.3.3).

### 9.3 Intents
- Every enemy except the Smokestack declares exactly one intent per Snuff Move, unless it is Dazed.
- The intent is shown as red tiles with a ✕, a damage number and push arrows.
- **Queue position** (1, 2, 3, …) is the only order number the player ever sees: in the right-rail queue, on the board, and in tooltips.

### 9.4 Smoke Plumes
- **Placement:**
  - Plumes are placed on the schedule in §4.4.
  - **Legal tile:** an empty `flagstone` or `rubble` tile, at least 2 from every hero, not in Gloam or `gloam_warning`, not a boss footprint, and inside the site's Plume zone (Vigil) or the chosen quadrant (Last Flame, §13.2.5).
  - Tiles come from the `spawn` stream. If no tile is legal, the Plume is skipped and logged.
- **Contents:** each Plume stores an `enemyId`, drawn from the Night tier's weights when it is placed. A Plume placed by Smoke, Smokestack or Haunt is always a `sootling`. The board shows a ghost of that enemy, and the tooltip is generated from it.
- **Pop:** a Plume is a 1-HP token. Any player strike or damaging player effect covering its tile pops it. Popping gives no Glory.
- **Rise** (in creation order):
  - If a Wickfolk piece or structure stands on the Plume, that piece takes 1 damage (Ward absorbs it; a Smoldering Wick takes none). The Plume is removed and nothing rises.
  - If a Snuff stands on it, the Plume is removed: no spawn, no damage.
  - Otherwise the enemy rises. It takes initiative after every existing enemy and has no intent until the next Snuff Move.
- Bosses moving onto a Plume destroy it.
- Snuff AI never ends a move on a Plume tile.
- Summons can never be placed on a Plume tile.

### 9.5 The placement routine
One routine places every spawn, summon or teleport that names an anchor: boss summons, Smokestacks, Velvet Moths, unit summons, respawns, and pieces displaced by a boss spawn.

1. List the legal tiles for the effect.
2. Sort them by distance from the anchor, then by reading order.
3. Take the first one.
4. If none is within 3 of the anchor, the effect fizzles with a log line. Respawn has no distance cap.
5. The unit limit applies.

---

## 10. Bosses

### 10.1 Common rules
- **Size:** 2×2. All bosses are immune to displacement, Gloam and Snuff attacks.
- **HP:** round_half_up((base + perPlayer × P) × `boss_hp_multiplier`).
  - P = number of Vigil seats (AI allies included), or the number of Last Flame heroes not eliminated at the start of the Boss Night (minimum 1).
  - Example: Guttered King, solo, `midnight`: (18 + 12) × 1.15 = 34.5, which rounds to 35.
- **Phases:** phase 2 starts when HP ≤ ⌊max HP × 2/3⌋, and phase 3 when HP ≤ ⌊max HP × 1/3⌋.
  - If one hit crosses both thresholds, both `onEnter` effects run, in order.
  - Damage is not capped at thresholds.
  - New phase intents start at the next Snuff Move. Intents already locked still resolve.
- **Intents:** every listed intent is declared at every Snuff Move, in listed order. Boss intents resolve before all enemy intents. Duplicate intents pick different targets when possible.
- **Dazed:** cancels the boss's last intent in the queue.
- **Movement:**
  - A step shifts the whole footprint by one vector. It is legal only if every newly entered tile is on the board, enterable, empty, and not a Pillar. Tiles the boss is immune to count as enterable.
  - There is no trampling, and bosses never use Chimneys.
  - Pathfinding runs over anchor positions toward the focus target: the nearest hero, with ties going to the highest Glory in Last Flame, then reading order.
- **Death:** the boss's death wins the Night in Vigil. In both modes it removes every Snuff on the board, the Clapper included.

### 10.2 Hush Hierophant — "The Bell That Swallows Song"
- **HP:** base 14, perPlayer 10. **Immune:** displacement, Gloam.
- **Art:** a riveted iron bell with a smoke robe and a coal-red clapper.

| Phase | Move | Intents | On enter |
|---|---|---|---|
| 1 | 1 orthogonal step | `bell_drop`, `hushwave` | — |
| 2 | King step | `bell_drop`, `hushwave`, `silencing_peal` | The clapper starts swinging (cosmetic). |
| 3 | King step | `bell_drop`, `bell_drop`, `hushwave`, `silencing_peal` | Summon 1 `clapper` (§9.5, anchor = footprint). |

- **Special rule:** "Silencing Peal limits each player to 1 card next turn."
- **Weakness:** "Hollow bell: Strikes from pieces adjacent to it deal +1 damage." (Cards do not get the bonus.)

### 10.3 The Guttered King — "Monarch of Melted Wax"
- **HP:** base 18, perPlayer 12. **Immune:** displacement, Gloam, Hot Wax.
- **Art:** a mountain of melted candles crowned with 7 moonfire wicks.

| Phase | Move | Intents | On enter |
|---|---|---|---|
| 1 | King step | `ladle_slam`, `sceptre_sweep` | — |
| 2 | King step | `ladle_slam`, `sceptre_sweep`, `wax_spit` | Summon `gutter_pawn` × [1, 1, 2, 2] for P = 1, 2, 3, 4 (Last Flame: `drip_hulk` instead). |
| 3 | King step | `ladle_slam`, `sceptre_sweep`, `sceptre_sweep`, `wax_spit` | Hot Wax on every empty tile of `ring12`. |

**CHECK and CHECKMATE** (`smothered_mate`)
- **Escapes** = how many of his 8 step vectors are currently legal. Hot Wax counts as open. Blocking tiles: the edge, Pillars, any piece (his own Gutter Pawns included), Vigil Candles, Wicks and Gloam.
- **CHECK!** shows when Escapes is 1 or 2.
- **CHECKMATE** happens when Escapes is 0 at the end of the players phase.
  - He takes ⌈15% of max HP⌉ damage, which ignores Ward, and one `crown_socket` fills.
  - This can happen again on later rounds, at most 3 times per fight.
  - In Last Flame, Checkmate damage is split equally among the players who have a piece adjacent to him.
- **Special rule:** "Immune to Hot Wax, and spits more of it."
- **Weakness:** "Box him in: block all 8 escape steps for CHECKMATE."

### 10.4 Nocturna — "Daughter of the Moth-Moon"
- **HP:** base 16, perPlayer 11. **Immune:** displacement, Gloam, Hot Wax. Flying.
- **Art:** stained-glass moth wings and an abdomen glowing with eaten light.

| Phase | Move | Intents | On enter |
|---|---|---|---|
| 1 | Queen slide 2, flying | `wing_gust`, `hunger` | — |
| 2 | Queen slide 2, flying | `wing_gust`, `hunger`, `hunger` | — |
| 3 | Queen slide 2, flying | `wing_gust`, `hunger`, `dust_storm` | Summon `gnawmoth` × 2. |

- **Special rule:** "Flies over everything. Hunger eats the brightest light and heals her."
- **Weakness:** "Light lures her: Hunger always bites the brightest light. Bait her with a Lantern or a Lit Shrine."

### 10.5 Boss intents
| Id | Boss | Area | Reach | Damage | Extra | Targeting |
|---|---|---|---|---|---|---|
| `bell_drop` | Hierophant | `block2x2` | Anchor within 5 of the footprint | 3 | Artillery, ignores LOS | The block covering the most heroes, then the most Wickfolk pieces, then Vigil Candles; then reading order. |
| `hushwave` | Hierophant | `ring12` | Around the footprint | 1 | Push 1 outward | Fixed. Cannot be reversed. |
| `silencing_peal` | Hierophant | Global | — | 0 | During the next players phase, each seat may play at most 1 card. Shown as a bell icon on the top bar. | — |
| `ladle_slam` | Guttered King | `side2` | Adjacent side | 3 | Push 1 | The side with the most heroes, then the most Wickfolk. |
| `sceptre_sweep` | Guttered King | `beam2` | 4 tiles from one side | 2 | `pierce` | The orthogonal direction with the most Wickfolk pieces. |
| `wax_spit` | Guttered King | `single` | Distance 2–4 | 1 | Artillery. Creates Hot Wax on the tile. | A tile with a hero, else any Wickfolk piece. |
| `wing_gust` | Nocturna | `beam2` | 3 tiles from one side | 1 | `pierce`, push 2 in the gust direction | The orthogonal direction with the most Wickfolk pieces. |
| `hunger` | Nocturna | `single` | Within 6 | 3 | `devour_light`: if it puts out a Lit Shrine, snuffs a Vigil Candle, destroys a Lantern or fells a piece, Nocturna heals 3 HP. | The brightest light: Lit Shrine > Lantern > Vigil Candle > hero. Ties: nearest, then reading order. |
| `dust_storm` | Nocturna | `square3` | Centre within 4 | 1 | Applies Dazed | The tile hitting the most Wickfolk pieces. |

---

## 11. Seats, Turns and Multiplayer

### 11.1 Seat types
- `human` (local or online), `bot_apprentice` (Easy), `bot_warden` (Normal), `bot_elder` (Hard).
- In Vigil, bot seats are called AI allies.

### 11.2 The players phase
- **Vigil:** seats act in any order, one at a time (§11.3). The phase ends when every seat has ended its seat turn.
- **Last Flame:** seats act clockwise (seat 1 → 2 → 3 → 4), starting with the First Light holder. First Light passes clockwise at the end of every Tally.

### 11.3 Vigil turn claims ("Take My Turn")
- One seat acts at a time. Clicking a plaque, or pressing **Take My Turn** online, claims that seat's turn until it ends.
- Claims made while another seat is acting queue first-in-first-out. Online, claims are ordered by the time the server receives them.
- A unit acts only during its owner's claim.
- **AI allies** act automatically, in seat order, once every human seat has ended. A human may click an ally's plaque ("Let them act") to run it earlier.
- **Solo:** the claim is automatic, and the button is hidden.
- **Online phase timer:** `turn_timer` × number of seats. When it runs out, every seat that has not ended auto-ends.

### 11.4 Turn timer
| Setting | Per seat turn |
|---|---|
| `off` | No limit |
| `slow` | 150 s |
| `normal` | 90 s |
| `fast` | 45 s |

**Fixed timers** (when `turn_timer` is not `off`): Chandlery 45 s; deploy, Toll and carry-over 20 s; Haunt 15 s.

**Expiry**
- The server rejects late actions and issues `end_turn`.
- The draft auto-picks with the `bot_apprentice` heuristic. Deploy keeps the default tiles. The Toll picks the Blessing. Carry-over keeps the default units. Haunt is skipped.

**When the timer starts**
- When the seat becomes active and the server-computed playback of the previous automated phase has ended. The server allows 1.5 s for latency.
- Hot-seat with a Pass screen: when the screen is dismissed, or 10 s after it is shown.
- Online with the timer `off`: after 180 s without input, the disconnect rule applies (§11.6).

### 11.5 Hot-seat and privacy
- In Vigil, hands are shared information, so no Pass screen is used.
- In Last Flame with `hot_seat_privacy` on, a Pass screen ("Pass the candle to [Name]") is shown before every seat turn and before every private draft.
- The deck viewer shows only your own deck.

### 11.6 Online play
- **Server-authoritative** (Appendix B).
- **Room codes:** 4 letters from `BCDFGHJKMNPQRSTVWXZ` (no vowels, so no words). Codes expire after 30 minutes idle.
- **Lobby:** any settings change clears every Ready flag. If the host leaves, the earliest-connected human becomes host. All players need the same engine version and mod `contentHash`.
- **Late join:** a late joiner takes over a bot seat at the start of that seat's next seat turn. A bot that is mid-turn finishes first.
- **Disconnects:**
  - A "reconnecting" badge shows during `reconnect_grace` (120 s). The grace is capped at 120 s while it is that seat's active turn.
  - After the grace, `bot_warden` takes the seat. The player reclaims it at the start of the seat's next seat turn.
  - In Vigil, other players keep acting meanwhile.
- The server persists the action log, so a restarted server can resume the game.

---

## 12. AI: Snuff Behaviour and Bots

### 12.1 Enemy target choice
Each enemy scores possible targets with no randomness, in this order:
1. Its preferred category:
   - `candles`: Vigil Candles.
   - `heroes`: heroes.
   - `light`: Lit Shrines, Lanterns, Vigil Candles.
   - `clusters`: the aim that hits the most Wickfolk pieces and Candles.
   - `nearest`: any Wickfolk piece or Candle.
2. Lethal targets first.
3. Shortest path distance.
4. Lowest HP.
5. Last Flame only: the target whose owner has the highest Glory.
6. Reading order.

If the preferred category is absent (for example, Candles in Last Flame), the enemy targets the nearest Wickfolk piece. Smoldering Wicks are never targets.

### 12.2 Enemy movement
- Breadth-first search over the enemy's move pattern to the closest tile from which its attack can hit the target. Ties: shortest path, then reading order.
- Path cost uses the tile AI cost (§5.4). Snuff avoid Hot Wax unless immune, never end on a Plume tile, and treat Chimneys as flagstone.
- Enemies move one at a time in initiative order (bosses first). An enemy that cannot reach an attack tile moves as close as it can.

### 12.3 Intent aim
- Choose the aim that hits the target. Among ties, prefer more Wickfolk pieces hit, then fewer Snuff hit, then reading order.
- Snuff avoid friendly fire unless no other aim hits the target.

### 12.4 Boss behaviour
- Bosses target as listed in §10.5.
- They move as in §10.1, ending on the anchor that lets the most intents hit their targets.

### 12.5 Bots
| Id | Label | Flavour | Planner budget | Behaviour |
|---|---|---|---|---|
| `bot_apprentice` | Easy | Apprentice | 200 node expansions | Greedy: the best immediate kill, then the best block. Always takes the Blessing. Drafts the cheapest card. |
| `bot_warden` | Normal | Warden | 2,000 node expansions | Beam search over a seat turn, scored with `previewSnuffStrike`. |
| `bot_elder` | Hard | Elder | 20,000 node expansions | Deeper beam search plus a one-round lookahead. In Last Flame it also weighs rivals' Glory. |

- Budgets count **node expansions**, never milliseconds, so the same seed always gives the same plan. A wall-clock cap of 2 s (Easy), 4 s (Normal) or 8 s (Hard) exists only as a safety net and falls back to the best plan at the last completed depth.
- Bots draw randomness from their `bot:<seat>` stream.
- **Last Flame:** bots plan on `viewFor(state, seat)`. Hidden information is filled by sampling, so bots never peek.
- **Online:** the server runs every bot and logs its actions.
- **Heuristics:** the Toll pick, draft, carry-over and Haunt use fixed heuristics per level.
- The takeover bot is `bot_warden`.
- **Hint** (the H key) runs the `bot_warden` planner with 2,000 nodes and highlights its first action.

### 12.6 Performance
- Bot planning and hints run in a Web Worker on the client, and in a worker thread on the server.
- The UI never blocks while they run. A "thinking" wisp shows on the bot's plaque.

---

## 13. Mode Rules and Progression

### 13.1 Vigil

#### 13.1.1 Vigil Candles
- Every Night places 3 Vigil Candles (3 HP each) on the site's Candle slots.
- On the Boss Night they stand in the `hollow_nave` arena (§13.3.4).

#### 13.1.2 Dread
- **Range:** Dread starts at `starting_dread` and goes up to M = `dread_max`. It persists across Nights.

| Event | Dread |
|---|---|
| A damage instance hits a Vigil Candle | +1 |
| A Vigil Candle is snuffed (in addition to the hit) | +1 |
| A hero falls | +1 |
| A hero self-relights at Tally (§13.1.3) | +1 |
| Each Tally on the Boss Night (the boss tolls) | +1 |
| Dawn of a regular Night, per Vigil Candle still lit | −1 (not below 0) |

- **Thresholds** are cosmetic only (darkness and music): `dimming` = ⌊M/3⌋, `deep_dark` = ⌊2M/3⌋, `long_night_falls` = M.
  - M = 12: 4, 8 and 12.
  - M = 14: 4, 9 and 14.

#### 13.1.3 Falling and relighting
- A hero at 0 HP becomes a Smoldering Wick on its tile (Dread +1).
- Its units still act. Cards that count from the hero cannot be played.
- Any adjacent allied piece may `relight` it by using its Strike (§6.6).
- A hero that was Smoldering at the end of the players phase and is still Smoldering at Tally relights itself at Tally with 1 HP (Dread +1).
- Heroes that are still Smoldering at Dawn relight with 1 HP, with no Dread cost, before the heal between Nights.

#### 13.1.4 End of a regular Night
After round T's Tally, `dawn` runs (§13.6).

#### 13.1.5 Victory and defeat
- **Victory:** the boss reaches 0 HP. This is checked after every atomic effect, and queued effects are discarded.
- **Defeat:** Dread ≥ M, checked after every atomic effect.
- If both happen in the same atomic effect, victory wins.
- Dread is the only loss track.

#### 13.1.6 Stars
| Stars | Condition |
|---|---|
| ★ | Victory |
| ★★ | Victory with final Dread < ⌊2M/3⌋ |
| ★★★ | Victory with final Dread < ⌊M/3⌋ and no Retry used |

#### 13.1.7 Retry this Night (Vigil only)
- Available when `retry_night` is on. Unlimited uses.
- It restores the `night_setup` snapshot, RNG stream positions included.
- In co-op it needs a unanimous vote within 30 s.
- Retries are counted in the stats. Daily runs disable Retry.

#### 13.1.8 Concede
Solo concedes at once. Co-op needs a unanimous vote.

### 13.2 Last Flame

#### 13.2.1 Setup
- **Board:** `last_flame_ring` (§13.3.4) at `board_size`.
- **Heroes:** each hero starts on its seat's start tile.
- **Neutrals:** with `neutrals` not `off`, each regular Night places L + `initial_enemies_mod` initial enemies (minimum 0), where L = living heroes. They are drawn from tier weights and placed in the central 4×4 with the placement routine (anchor: the board centre).

#### 13.2.2 Glory
| Event | Glory |
|---|---|
| Kill a Snuff | Its rank value (§9.1) |
| Fell a rival unit | +1 |
| Fell a rival hero | +3 |
| Bounty: fell the hero of the sole Glory leader | +3 more |
| Light a Votive Shrine | +1 |
| Boss damage | +1 per full 10% of the boss's max HP you dealt (Checkmate shares count) |
| Boss killing blow | +2 |
| Alive at the end of the game | +5 |
| Your hero falls, from any cause | −2 (not below 0) |

#### 13.2.3 Truce
- `truce` is `night_1` by default, or `nights_1_2`.
- During a truce, a player may not target, damage, push, pull, swap, Daze, Burn or bump a rival piece. Area effects skip rivals (reason `TRUCE`).
- Redirecting a Snuff onto a rival is allowed, but it earns no Glory and no Bounty.
- `nights_1_2` is greyed out when there are fewer than 3 regular Nights.

#### 13.2.4 Bounty (`bounty_seal`)
- The leader is fixed at the moment of the kill, before that kill's Glory is applied. The leader must hold strictly the most Glory; a tie means no leader.
- Credit follows §6.3. The bonus is +3.
- None during a truce. At most once per victim per Night.
- The leader's plaque shows the "Wanted" wax seal.

#### 13.2.5 Neutral Plumes
- **Count per placement:**
  - `off`: 0.
  - Otherwise: max(1, L − 1 + `plumes_mod`), +1 with `swarm`, +1 with `black_sun`.
- **Where:** round-robin by quadrant (the board split at its middle file and rank).
  1. Start at the First Light holder's start quadrant and go clockwise.
  2. Pick a legal tile in that quadrant with the `spawn` stream.
  3. If the quadrant has none, try the next quadrant.

#### 13.2.6 Falling, respawn and elimination
- **Before the Boss Night, with `respawn_before_boss` on:**
  - The fallen hero becomes a Smoldering Wick.
  - At the start of its owner's next seat turn, the Wick is removed. The hero reappears at its start tile with ⌈max HP/2⌉ HP and Ready. If that tile is not available, it uses the placement routine with no distance cap, outside Gloam.
  - If Gloam covers the Wick before then, the hero is eliminated.
- **On the Boss Night, or with `respawn_before_boss` off:** a fallen hero is eliminated at once. Its units melt.
- **Placement bands:** players eliminated by the same atomic effect, or the same Tally step, share an elimination band.

#### 13.2.7 Haunting
- With `haunting` on, each eliminated player places 1 Sootling Plume at each Plume placement (15 s, otherwise skipped).
- The tile must be legal (§9.4).
- The **haunted hero** is the hero nearest the Plume (ties: seat order from the First Light holder). A player cannot haunt the same hero twice in a row, and each hero receives at most 1 Haunt Plume per round.
- Bots haunt the Glory leader.

#### 13.2.8 The Gloam
- C = closings to reach 4×4: 4 on 12×12 (12 → 10 → 8 → 6 → 4), 3 on 10×10 (10 → 8 → 6 → 4).
- Each closing covers the outermost ring that is still open.
- **Schedule:**
  - The first C − 1 closings happen at the Dawns of the last C − 1 regular Nights. If there are fewer regular Nights than that, the remaining closings happen at the Tallies of boss rounds 1, 2, … in order.
  - The last closing (to 4×4) happens at the Tally of boss round 3.

| Board | Length | Closings |
|---|---|---|
| 12×12 | `short` | Dawn of Night 1 (10×10), Dawn of Night 2 (8×8), boss round 1 (6×6), boss round 3 (4×4) |
| 12×12 | `standard` | Dawns of Nights 1, 2, 3 (10, 8, 6), boss round 3 (4×4) |
| 12×12 | `long` | Dawns of Nights 2, 3, 4 (10, 8, 6), boss round 3 (4×4) |
| 10×10 | `short` | Dawns of Nights 1, 2 (8, 6), boss round 3 (4×4) |
| 10×10 | `standard` | Dawns of Nights 2, 3 (8, 6), boss round 3 (4×4) |
| 10×10 | `long` | Dawns of Nights 3, 4 (8, 6), boss round 3 (4×4) |

- The final 4×4 zone is e5–h8 on 12×12 and d4–g7 on 10×10. It always holds the boss footprint and its `ring12`.
- A Dawn closing is applied at step 1 of round T's Tally, the last Tally of that Night, and `gloam_warning` shows during round T. A boss-round closing is applied at step 1 of that round's Tally.
- The **Gloam Bell** widget counts down the rounds until the next closing.

#### 13.2.9 Boss Night and the end of the game
- At Boss Night setup, the boss spawns with its anchor at the board centre: f6 on 12×12, e5 on 10×10. Pieces on the footprint are moved by the placement routine.
- The boss attacks everyone, and PvP stays on.
- **The game ends at the first of:**
  - the end of the round in which the boss falls (after its Tally);
  - the end of the Tally of the last boss round;
  - the end of a Tally at which one or no heroes stand.
- **Final score** = Glory, plus 5 for each hero still standing.
- **Placement** is by final score. Ties go to: still standing, then later elimination band; then boss damage dealt; then shared placement (co-winners).

### 13.3 Sites, Nights and Enemies

#### 13.3.1 Night order
- **Vigil Night 1:** `cathedral_of_tallow`. In the first-ever game, Night 1 is `first_vigil` and Night 2 is `cathedral_of_tallow`.
- **Regular Nights 2+:** a random site from `soot_market`, `belfry_steps` and `the_waxworks` (`map` stream). No site repeats until all have been used; after that, all four can be drawn.
- **Boss Night:** `hollow_nave`.
- **Last Flame:** every Night uses `last_flame_ring`.

#### 13.3.2 Initial enemies and Plumes
| | Vigil, regular Night | Vigil, Boss Night | Last Flame |
|---|---|---|---|
| Initial enemies | P + tier + `initial_enemies_mod` (minimum 1) | P + `initial_enemies_mod` (minimum 0) | §13.2.1 (regular Nights); 0 on the Boss Night |
| Plumes per placement | max(1, 1 + ⌊P/2⌋ + `plumes_mod`), +1 with `black_sun` | Same | §13.2.5 |
| Extra Smokestack | 1 on regular Nights of tier ≥ 2 when `extra_smokestack` is on | — | Same rule, placed in the centre |

- Initial enemies are placed on random legal tiles of the Snuff zone (`spawn` stream).
- `first_vigil` is a scripted map and ignores all enemy and Plume modifiers on its Night.

#### 13.3.3 Tiers
- Regular Night k of R gets tier = 1 + ⌊3(k − 1)/R⌋. The Boss Night is tier 3.
- `short` (R = 2): [1, 2]. `standard` (R = 3): [1, 2, 3]. Vigil `long` (R = 5): [1, 1, 2, 2, 3]. Last Flame `long` (R = 4): [1, 1, 2, 3].

#### 13.3.4 Sites and maps
**Zones on generated Vigil sites**
| Zone | 8×8 | 10×10 |
|---|---|---|
| Deploy zone | Ranks 1–2 | Ranks 1–2 |
| Snuff zone | Ranks 7–8 | Ranks 9–10 |
| Plume zone | Ranks 4–8 | Ranks 5–10 |
| Candle slots | Ranks 3–4 | Ranks 3–5 |

- The 3 Candles are at least 2 apart.
- Default hero start tiles, in seat order: d1, e1, c1, f1 (8×8); e1, f1, d1, g1 (10×10).

**Site templates** (counts given as 8×8 / 10×10)
| Site | Pillars | Rubble | Votive Shrines | Chimney pairs | Hot Wax | Smokestacks |
|---|---|---|---|---|---|---|
| `cathedral_of_tallow` | 4 / 6, mirrored | 2 / 3 | 1 / 2 | 0 / 0 | 0 / 0 | 0 / 0 |
| `soot_market` | 2 / 3 | 6 / 9 | 1 / 2 | 1 / 1 | 0 / 0 | 0 / 0 |
| `belfry_steps` | 6 / 8, in staggered lanes | 0 / 0 | 1 / 2 | 0 / 0 | 2 / 3 | 0 / 0 |
| `the_waxworks` | 2 / 3 | 2 / 3 | 1 / 2 | 1 / 2 | 4 / 6 | 1 / 1 |

**Generation**
- Uses the `map` stream.
- A generated site is valid when:
  - every Vigil Candle can be reached by a Sootling from the Snuff zone;
  - every deploy tile is connected;
  - every Chimney is paired;
  - the Plume zone has at least 12 legal tiles at setup;
  - no enemy starts within 2 of a hero start.
- Retry up to 50 times, then fall back to the `first_vigil` layout without its scripted content.

**`first_vigil`** (fixed 8×8 tutorial map)
| Element | Tiles |
|---|---|
| Pillars | b7, g7 |
| Votive Shrine | c5 |
| Vigil Candles | c3, f3, g5 |
| Heroes and turn-1 Sootlings | See §15.2 |
| Plumes | c6 at setup (Sootling); f6 at Tally 1 (Sootling); b6 at Tally 2 (Ink Wretch). An illegal scripted tile falls back to the placement routine. |

**`hollow_nave`** (fixed boss arena)
| Element | 8×8 | 10×10 |
|---|---|---|
| Boss anchor | d6 (d6, e6, d7, e7) | e7 (e7, f7, e8, f8) |
| Pillars | b6, g6 | c7, h7 |
| Votive Shrines | a3, h3 | a3, j3 |
| Vigil Candles | b4, e3, g4 | c4, f3, h4 |
| Hero starts (seat order) | d1, e1, c1, f1 | e1, f1, d1, g1 |

**`last_flame_ring`** (fixed, with 4-fold rotational symmetry)
| Element | 12×12 | 10×10 |
|---|---|---|
| Start tiles, seats 1–4 | c3, j3, j10, c10 | c3, h3, h8, c8 |
| Pillars | b7, f2, k6, g11, d6, g4, i7, f9 | c5, f3, h6, e8 |
| Votive Shrines | e3, j5, h10, c8 | d2, i4, g9, b7 |
| Chimney pairs | d4↔i9, d9↔i4 | b2↔i9, b9↔i2 |
| Rubble | b10, c2, k3, j11 | d9, b4, g2, i7 |

- With 2 seats, the start tiles are c3 and h8 (10×10) or c3 and j10 (12×12).
- With 3 seats, seats 1–3 use the first three start tiles. All three are equidistant.

### 13.4 Tolls (the Night's event card)
- With `tolls` on, at the start of every regular Night from Night 2, reveal 1 eligible Blessing and 1 eligible Curse (`toll` stream).
- **Chooser:** in Vigil, the First Light holder (First Light passes clockwise at each Dawn). In Last Flame, the lowest-Glory player (ties: turn order from the First Light holder).
- **Curse reward:** at the next Chandlery, every seat takes 2 of the 3 offered cards instead of 1.
- No Toll on the Boss Night.
- Tolls with `requires` are eligible only when the requirement is met.

| Id | Name | Kind | Requires | Effect for the whole Night |
|---|---|---|---|---|
| `candlemas_blessing` | Candlemas Blessing | Blessing | — | Every hero and Vigil Candle starts the Night with Ward. |
| `lucky_wick` | Lucky Wick | Blessing | — | Draw up to 6 cards instead of 5. |
| `hearthwind` | Hearthwind | Blessing | — | At every Tally, every Wickfolk piece heals 1 HP. |
| `peddler_of_wicks` | Peddler of Wicks | Blessing | — | +1 Flame at the start of every seat turn. |
| `moth_migration` | Moth Migration | Blessing | — | Each hero starts the Night with a free Velvet Moth (§9.5, anchor = hero; counts toward the unit limit). |
| `soot_fog` | Soot Fog | Curse | — | Every Wickfolk range (strikes, cards, Powers) is 1 shorter, minimum 1. |
| `bell_of_embers` | Bell of Embers | Curse | — | Snuff attacks also apply Burn. |
| `waxen_rain` | Waxen Rain | Curse | — | At every Plume placement, 2 Hot Wax pools also appear on empty flagstones at least 2 from every hero. |
| `ill_omen` | Ill Omen | Curse | `moth_die` on | Moth Die faces 5 and 6 count as 3 (Stillness). |
| `crumbling_nave` | Crumbling Nave | Curse | At least 1 Pillar | At Night start, every Pillar crumbles into Rubble, and 4 more Rubble tiles appear on empty flagstones. |
| `restless_soot` | Restless Soot | Curse | — | Snuff steps and slides move 1 tile farther. |
| `shifting_chimneys` | Shifting Chimneys | Curse | At least 1 Chimney pair | At every Tally, each Chimney pair moves to new empty flagstones at least 2 from every hero. |
| `muffled_nave` | Muffled Nave | Curse | — | Each seat may play at most 2 cards per seat turn. |
| `black_sun` | Black Sun | Curse | Plumes are on | +1 Plume at every Plume placement. |

### 13.5 The Moth Die (Omen)
- With `moth_die` on, the die is rolled at the start of every round (`omen` stream).
- The top bar shows the face's effect label, never just its name.

| Face | Id | Label | Effect this round |
|---|---|---|---|
| 1 | `eclipse` | "Snuff hit +1" | Every Snuff intent deals +1 damage. |
| 2 | `smoke` | "Extra Plume" | A Sootling Plume appears now (legal tile; it rises this round). With `neutrals` off, nothing happens. |
| 3 | `stillness` | "Calm" | No effect. |
| 4 | `long_shadows` | "Slow Snuff" | Snuff steps and slides move 1 tile less (minimum 1). Leaps are unchanged. |
| 5 | `kindling` | "+1 Flame" | Every seat gets +1 Flame at the start of its seat turn. |
| 6 | `bright_wings` | "Draw +1" | Every seat draws 1 extra card at the start of its seat turn. |

Faces 1–2 are bad, 3–4 neutral, 5–6 good. The sound chimes follow this (§16.11).

### 13.6 Dawn, Chandlery, Boons and Heirlooms
**Dawn** (regular Nights)
1. All Snuff and Plumes vanish.
2. Vigil: Dread −1 for each lit Vigil Candle.
3. Smoldering heroes relight with 1 HP.
4. Heroes and kept units heal `heal_between_nights` HP, up to max.
5. **Carry-over:** keep up to 2 units (`carry_over`). The default is the 2 with the highest current HP, ties going to the most recently summoned. The rest melt. In Vigil, kept units redeploy at the next `night_setup`. In Last Flame, heroes and kept units stay on their tiles.
6. Statuses clear. Charms return to the discard pile. Hands are discarded.

**Chandlery**
- **Offer:** 3 different cards from your class pool plus the neutral pool (`draft:<seat>` stream), at least 1 of them a class card.
- **Rarity weights:** Common 6, Rare 3, Mythic 1.
- **Pick:** take 1 (2 after a Curse) or skip (`skip_pick`).
- **Boon** (with `boons` on): choose 1.
  - `heirloom`: choose 1 of 2 random Heirlooms you don't own.
  - `temper`: temper one card (§7.1).
  - `prune`: remove up to 2 cards. The deck cannot go below 8.
- **Vigil:** offers are visible to everyone, and all seats draft at the same time.
- **Last Flame:** offers are private. Online, everyone drafts at the same time. Hot-seat goes in seat order with Pass screens.

**Heirlooms** (passive, owned by the hero for the rest of the game)
| Id | Name | Effect |
|---|---|---|
| `ever_burning_wick` | Ever-Burning Wick | Your hero starts every Night with Ward. |
| `brass_thimble` | Brass Thimble | +2 max HP for your hero. |
| `lamplighters_hook` | Lamplighter's Hook | +1 range on every card that counts from your hero. |
| `moth_velvet_cloak` | Moth-Velvet Cloak | Your hero is flying. |
| `candlemakers_mold` | Candlemaker's Mold | Your first Summon each seat turn costs 1 less Flame (minimum 0). |
| `bell_of_saint_tallow` | Bell of Saint Tallow | Once per Night, as a free action, Daze an enemy within 4 of your hero (`ring_bell`). |

### 13.7 Unlock ladder (easy start)
A completed-games counter is stored locally.

| When | What is on |
|---|---|
| First-ever game | Quick Play defaults (§14.3): no Tolls, no Moth Die, no Boons. |
| From game 2 | Tolls, Moth Die and Boons follow the settings (on by default). |
| First Quick Last Flame | Bounty and Haunting off. A 3-line primer: the most Glory wins; the Gloam ring closes in as the Nights pass; no fighting rivals on Night 1. |
| After a lost Quick Play | The next Quick Play pre-selects `candlelit`. |

---

## 14. Configuration

### 14.1 Rule parameters
The parameters are listed in the Engineering summary.
- Every rule parameter has a tooltip in the Advanced panel. Only the current mode's parameters are shown: Vigil hides `neutrals`, `truce`, `bounty`, `haunting`, `respawn_before_boss`, `board_size` and `boss_rounds`; Last Flame hides `starting_dread`, `dread_max` and `retry_night`.
- **Precedence** (later wins): defaults < length preset < difficulty preset < one-click mode < user overrides.
- **Validation:** illegal combinations are greyed out with a reason. Examples: `12x12` with 2 seats; `nights_1_2` with fewer than 3 regular Nights; duplicate heroes.

### 14.2 Difficulty presets
| | `candlelit` | `dusk` | `midnight` | `witching_hour` |
|---|---|---|---|---|
| Chip | 1 candle · Gentle | 2 candles · Normal | 3 candles · Hard | 4 candles · Brutal |
| `starting_dread` / `dread_max` | 0 / 14 | 0 / 12 | 2 / 12 | 3 / 12 |
| `initial_enemies_mod` | −1 | 0 | 0 | +1 |
| `plumes_mod` | −1 | 0 | 0 | +1 |
| `enemy_hp_mod` | `none` | `none` | `non_minions` | `all` |
| `boss_hp_multiplier` | 0.80 | 1.00 | 1.15 | 1.30 |
| `heal_between_nights` | 6 | 4 | 3 | 2 |
| `extra_smokestack` | Off | Off | On | On |
| `retry_night` | On | On | Off | Off |

### 14.3 Length presets and one-click modes
Every regular Night has `turns_per_night` = 4 rounds.

| Preset | Vigil `nights` | Last Flame `nights` | Last Flame `boss_rounds` | Target time |
|---|---|---|---|---|
| `short` | 3 (2 + Boss Night) | 3 (2 + Boss Night) | 5 | Vigil solo 20 min; Quick Last Flame (you + 2 bots, 10×10) 30 min |
| `standard` | 4 (3 + Boss Night) | 4 (3 + Boss Night) | 5 | Vigil solo 35 min; Last Flame, 4 humans, `normal` timer, 60 min |
| `long` | 6 (5 + Boss Night) | 5 (4 + Boss Night) | 6 | Vigil solo 55 min; Last Flame, 4 humans, `normal` timer, 80 min |

**QUICK PLAY** (solo Vigil, one click after choosing a hero)
- **First-ever game:** `short`, `candlelit`, Night 1 on `first_vigil`, Night 2 on `cathedral_of_tallow`, `hush_hierophant` as the boss, hints on, `tolls` off, `moth_die` off, `boons` off.
- **Later games:** `short`, `dusk` (or `candlelit` after a loss), generated sites, random boss, everything else on.

**QUICK LAST FLAME:** you plus 2 `bot_warden` seats on 10×10, `short`, `dusk`, `truce` `night_1`, `turn_timer` off. Bots get random unpicked heroes, and you use the same hero picker.

**Preset chips** on the Setup screen: Short, Standard, Long, Daily, Custom 1–3 (saved locally).

**Daily**
- Locks `standard`, `dusk`, solo Vigil, and a boss drawn from the seed. Retry and mods are disabled.
- Seed: `daily:YYYY-MM-DD` (UTC date). Any hero may be chosen.

### 14.4 Presentation settings (per device, not in the settings code)
| Key | Default | Options |
|---|---|---|
| `animation_speed` | 1× | 0.5×, 1×, 2×, 3× |
| `enemy_turn_speed` | `normal` | `normal`, `fast` (×2), `instant`. Locally only: online, the server's pacing applies (Appendix B.4). |
| `reduced_motion` | Off | On / Off. Turns off shake, parallax and particles. Replaces flashes with fades and freezes looping flicker. The Moth Die shows its result at once. |
| `screen_shake` | On | On / Off |
| `bold_outlines` | Off | On / Off. Shapes are always drawn; On adds bold outlines. |
| `readable_font` | Off | On / Off. Swaps Cinzel Decorative, IM Fell English and EB Garamond for `system-ui`. The logo is unchanged. |
| `ui_scale` | 100% | 90–150% in 10% steps, clamped so board tiles stay at least 36 px |
| `confirm_end_turn` | `smart` | `smart` (ask only when Ready pieces or playable cards remain), `always`, `never`. On touch, End Turn always uses two taps (§15.7). |
| `tutorial_hints` | `auto` | `auto` (first 3 games), `on`, `off` |
| `master_volume` / `sfx_volume` / `music_volume` | 80% / 90% / 60% | 0–100% |
| `mute` | Off | On / Off |

Audio settings persist in `localStorage` under `chesscard.audio` (already implemented).

### 14.5 Host options (not in the settings code)
| Key | Default | Options |
|---|---|---|
| `hot_seat_privacy` | On | On / Off (Last Flame hot-seat Pass screens) |
| `reconnect_grace` | 120 s | 30–600 s, capped at 120 s during that seat's active turn |

### 14.6 Settings code
- **Copy settings code:** `WAX1:` followed by URL-safe base64 of `{"v":1,"presets":{"mode":…,"length":…,"difficulty":…},"overrides":{…},"contentHash":"…"}`.
  - `WAX1` means frozen defaults version 1. Only parameters that differ from their preset are written.
- **Paste code:**
  - Unknown keys are ignored.
  - Out-of-range values are clamped.
  - Both are listed in a toast.
  - A different `contentHash` shows "Made with different content (mods)".
- **Seed text** is normalised to NFC, trimmed, case-sensitive, and at most 32 characters.

---

## 15. UX Flow

### 15.1 Screens
1. **Title**
   - **Scene:** the Moth-Moon hangs over the spires of Sconcewick, a single candle burns in a window, and smoke tendrils creep toward it. The cursor carries a small light that pushes the tendrils back.
   - **Buttons, from largest to smallest:** **QUICK PLAY** (gold, pulsing), Quick Last Flame, New Game, Join Online, How to Play, Codex, Settings.
   - Mode subtitles: "Vigil — team up against the Snuff" and "Last Flame — every candle for itself".
2. **Choose your Lanternwarden** (Quick Play and Quick Last Flame)
   - Four large hero cards, each with a silhouette, the movement rune, HP/ATK and the pitch line (§8.1).
   - **One click starts the game.** A 2-second title card plays, then the board appears. In the first game it reads "Night 1 · First Vigil — Survive 4 rounds. Keep the Candles lit."
3. **Setup (New Game)**
   - **Left:** a mode toggle with subtitles, and up to 4 seat cards (type, hero, House glyph assigned by seat, ready light) with "Add AI ally" (Vigil) or "Add bot" (Last Flame).
   - **Right:**
     - Preset chips.
     - **Basic** options: difficulty (candle chips), length, boss, and board size (Last Flame only).
     - A collapsible **Advanced** panel with the current mode's parameters (§14.1), each with a tooltip.
   - **Bottom:** Start, Host Online, Copy settings code, Paste code.
4. **Online lobby**
   - A 4-letter room code (for example `KWTR`). Players claim seats and toggle Ready.
   - The host edits settings until everyone is Ready, and any change clears all Ready flags.
   - Late joiners take a bot seat at its next seat turn. A "reconnecting" badge shows during the grace period.
5. **How to Play** (one screen)
   - The 8 rules (§2.1), each with an animated diagram.
   - A **pattern gallery**: 8 looping mini-boards (King step, Knight leap, Rook slide, Bishop slide, Queen slide, Pawn, Flying, Artillery), each captioned with its rune.
   - Buttons: "Play the tutorial" and "Watch a 20-second demo" (an autoplaying bot turn).
6. **Game** (layout in §15.4).
7. **Pass screen** (Last Flame hot-seat): "Pass the candle to [Name]". A full-screen veil hides hands.
8. **The Chandlery** (between Nights)
   - **Night summary:** kills, Dread change (Vigil) or Glory change (Last Flame), Candles standing, and the next site's name.
   - **Draft:** three cards rise from a wax tray on velvet. Hovering a card shows its synergy tags. Pick or Skip, then the Boon choice (hidden when Boons are off). A deck viewer is available.
9. **Boss intro** (4 seconds, skippable)
   - The screen dims and a bell tolls. The boss silhouette rises from smoke.
   - The name appears in Cinzel Decorative, with the epithet in Cinzel.
   - Its phase 1 intents appear as pattern diagrams, then its special rule in one plain line and a **"Weakness:"** line (§10).
   - Phase changes play a 1.5-second banner.
10. **Victory: "Dawn Breaks"** (Vigil) or **the Last Flame podium**
    - A sunrise sweep; every candle closes its eyes happily.
    - Stats: stars or Glory breakdown, MVP piece, damage, kills, Plumes blocked, Candles saved, retries. The seed is shown for offline games, and online at `game_over` (Appendix B.3).
    - Buttons: Play Again, Same Seed, Change Hero, Main Menu.
11. **Defeat: "The Long Night Falls"**
    - The Hour Candle gutters, the screen goes black, and two moth eyespots slowly open.
    - Shows the cause of defeat.
    - Buttons: Retry this Night (when enabled), Same Seed, Main Menu.
12. **Codex**
    - Every unit, card, enemy, boss, Toll, Moth Die face, tile, Heirloom and Boon, rendered live from the data files.
    - **Load mod (JSON)** field. Schema and reference errors are listed with file and path (Appendix A.3).
13. **Settings:** the options in §14.4.

### 15.2 The first 30 seconds: tutorial seeds (first-ever Quick Play, `first_vigil`)
- Turn 1 is scripted: the scripted placement replaces the round-1 Snuff Move. The two Sootlings start in place with their intents already locked.
- A Plume (Sootling) is at **c6**. The opening hand is fixed, and turn-1 Flame is 3.
- Coach marks 1–4 allow only the guaranteed-line actions, plus Skip.

| Hero | Start | Sootlings (aiming at) | Opening hand | Guaranteed line | Flame used |
|---|---|---|---|---|---|
| Brannoc | d2 | c4 (Candle c3), f5 (Candle g5) | `light_a_taper`, `spark`, `shield_bash`, `waxen_ward`, `call_the_squire` | Move d2→d3. Strike c4; Take to c4. Spark f5 (distance 3). Summon a Squire. | 1 + 2 = 3 |
| Velveteen | e2 | d4 (Candle c3), g4 (Candle g5) | `light_a_taper`, `spark`, `loose_a_moth`, `velvet_pull`, `moth_dust` | Leap-strike d4 from e2 (a Velvet Moth appears on d4). Spark g4 (distance 2). Loose a Moth. | 1 + 1 = 2 |
| Wicklow | d2 | d4 (Candle c3), b4 (Candle c3) | `hang_a_lantern`, `tinder_bolt`, `spark`, `prime_the_mortar`, `mend_the_wick` | Strike d4 up the d-file. Slide d2→b2. Tinder Bolt b4 up the b-file. Hang a Lantern. | 1 + 2 = 3 |
| Vey | d2 | f4 (Candle f3), g3 (Candle f3) | `strike_a_cinder`, `feint`, `searing_edge`, `spark`, `light_a_taper` | Strike f4 through e3; Take to f4. Flourish: strike g3; Take to g3. Strike a Cinder. | 1 |

Every guaranteed line ends in a double kill with Dread +0. Appendix B.6 has the test.

**Timeline**
| Time | What happens |
|---|---|
| 0 s | Click QUICK PLAY. |
| About 3 s | Click a hero card. |
| About 5 s | Title card. |
| About 7 s | The board fades in and coach mark 1 appears. |
| About 10–20 s | First strike. |

### 15.3 Coach marks and first-time tips
- Coach marks appear one at a time, each with an arrow.
- Each mark has `completeWhen` and `abortWhen` conditions (the target is gone, the action became illegal, the phase changed). If the player is idle for 15 s, a "Got it" button appears.
- A "Skip tutorial" link is always visible. Mark text changes with the input type (mouse or touch).

| # | Text | Closes when |
|---|---|---|
| 1 | "The Snuff want your Vigil Candles. Red tiles show where they will strike after your turn. Click your hero." | The hero is selected. |
| 2 | "Each piece may Move once and Strike once, in either order." Then, for Brannoc: "Gold dots are moves. Step to d3." For the others: "Gold rings are foes you can hit. Strike the Sootling." Brannoc then gets: "Gold rings are foes you can hit. Strike the Sootling." | The move or strike is done. |
| 3 | Brannoc and Vey: "A melee kill takes its square, like chess." Wicklow: "Ranged strikes stay put." Velveteen: "Velveteen's kills don't move in. They leave a Velvet Moth." | It fades after 3 s, or on the next click. |
| 4 | Brannoc and Velveteen: "Cards cost Flame (the flames beside your hand). Play **Spark** on the other Sootling." Wicklow: "Slide to b2, then play **Tinder Bolt** up the b-file." Vey: "**Flourish!** A kill earns another strike. Take the second Sootling." | The action is done. |
| 5 | "Summon a piece: drag **[summon card]** onto a glowing tile, or tap the card and then the tile. New pieces act next turn." Wicklow adds: "His Lanterns can shoot right away." It is skipped automatically if the summon can't be afforded. | The summon is played. |
| 6 | Mouse: "Hover **End Turn** to preview what the Snuff will do, then press it (Space)." Touch: "Tap **End Turn** once to preview, and again to confirm." | The turn is ended. |

**First-time tips**
- Each tip is shown once, the first time its situation comes up.
- At most one tip appears per beat; the rest queue. A tip shown during automated playback pauses it.
- **First Plume tip:** shown on the first End Turn preview: "Smoke Plume: a Sootling rises here after the Snuff Strike. Stand on it to block it (take 1) or strike it to pop it."
- **First Dread tip:** "A Candle hit adds Dread (the Hour Candle). Full Dread and the Long Night falls."
- **Other tips:**
  - Push, bump, Hot Wax, Chimney, Shrine, Ward, Dazed.
  - Aimed attacks, shown the first time an intent is displaced: "its attack moved with it".
  - Smoldering, Toll, Moth Die, the Chandlery.
  - Boss phase, Gutter Pawn crown, CHECK, Gloam warning, Lit Shrine.
- **Introduction order on `first_vigil`:** Night 1 uses only Sootlings, one Ink Wretch and a Shrine. Chimneys and Hot Wax first appear on later Nights.

### 15.4 Game screen layout
- The logical canvas is 1280×720 and scales to fit. The minimum is 1024×600, landscape, touch-friendly.
- Breakpoints are evaluated on CSS viewport pixels.

| Area | Contents |
|---|---|
| **Top bar** (48 px) | Night n/N and Round t/T (Vigil Boss Night: "Round t"); the 3-beat phase ribbon (**Snuff Move → Your turns → Snuff Strike**, with the current beat lit); the Hour Candle (Vigil Dread) or the Gloam Bell (Last Flame); the Moth Die face label; the active Toll; the Silencing Peal icon when active; the boss HP bar on the Boss Night, centred, with phase notches (and crown sockets for the Guttered King). Any slot whose system is off is hidden. |
| **Left rail** (200 px; collapses to 64 px portraits below 1200 CSS px wide) | Player plaques: portrait, HP wax bar, Flame. Last Flame adds Glory, the House glyph, First Light and the Wanted seal. Heirlooms appear in a hover row. "Take My Turn" appears only in co-op. |
| **Centre** | The board, auto-fitted. On small screens it zooms and pans. |
| **Right rail** (240 px) | The **intent queue** in resolution order, with queue positions in Cinzel. Example: "1 · Ink Wretch → lances **c3 Vigil Candle** for 1 (Dread +1)". Hovering an entry highlights it on the board. Below it, a collapsible log. In Last Flame the right rail is a drawer, and queue positions are drawn on the board. |
| **Bottom** (140 px; 96 px in Last Flame) | The hand as a fan of mini cards (cost, name, sigil; the full card shows on lift), Flame shown as small teardrop flames in a sconce row (spent ones become smoking wicks), deck and discard counts, Hero Power button, Undo, Hint, and **End Turn** (a large wax-seal button that pulses when nothing is left to do). |

**Tile size checks**
| Board | Viewport | Tile size |
|---|---|---|
| 12×12 (Last Flame) | 1280×720 | 48 px |
| 12×12 (Last Flame) | 1024×600 | 38 px |
| 10×10 (Vigil) | 1024×600 | 41 px |
| 8×8 (Vigil) | 1024×600 | 51 px |

### 15.5 Highlights
Red (`blood_wax`) is used only for Snuff threats. Every state also has a shape, so it never depends on colour alone.

| State | What is shown |
|---|---|
| Ready piece | A House-colour halo pulses. Two pips on the base (boot, sword) empty separately. When both are empty, the piece dims and a wisp of wick smoke curls up. |
| Piece selected | It lifts 6 px. **Gold dots** mark moves. **Gold rings with a sword tick** mark strike targets, with a damage badge in `flame_core` ("−2"), a skull if lethal, and a ghost of the piece where a Take would land. Ranged strikes draw a dotted ember line. **White arrows** preview pushes, with "bump 1" badges. A move dot on a red tile carries a "!" badge with a tooltip such as "⚠ Will be struck for 2". Danger badges are computed with `previewSnuffStrike` on the hypothetical position (Ward absorption included) and recomputed after every action. A Chimney dot shows a swirl and lights its pair. A Hot Wax dot shows a drip badge "−1". |
| Danger | Intent tiles show a red 40% fill, diagonal hatching and a ✕ glyph, plus the damage number and push arrows. |
| Plume | A violet spiral with a ghost of the stored enemy and a 1-HP drop. The tooltip is generated from the stored enemy. |
| Card selected | The card lifts. Valid targets glow in the type colour (Summon gold, Rite ember, Charm verdigris). The range appears as a dashed rune ring. Effects preview on the targets: damage numbers, ghosted summons, swap lines, reversed intent arrows, area outlines. Invalid tiles dim to 40%, and the Flame to be spent pulses. |
| Enemy inspected (hover or long-press) | A dotted white outline shows its move range. Its intent outline brightens. A "moves with it" outline appears if it has been displaced. Tooltip example: "Ink Wretch · Soldier · 2 HP · Prefers Candles · Will lance c3 for 1 · Queue 1". |
| Guttered King | Escape arrows around him: blue for open, grey ✕ for blocked, and "Escapes: 3". "CHECK!" shows at 1–2 escapes. |
| End Turn preview | The full Snuff Strike preview list. Hovering a line highlights it on the board. |

**Render order:** tiles → darkness → hazard glyphs (Hot Wax, Chimney, Shrine, Gloam) → pieces → intents, highlights and numbers → particles → UI. Lighting never hides game information.

### 15.6 Reason codes
A card or action that can't be used turns grey, shakes when clicked, and shows its reason. Strings live in a localisation table keyed by code.

| Code | English string |
|---|---|
| `NEED_FLAME` | "Need {n} Flame" |
| `UNIT_LIMIT` | "Unit limit {n}/{max}" |
| `NO_TILE` | "No empty tile within {r} of your hero" |
| `NO_TARGET` | "No enemy in range" |
| `CARD_LIMIT` | "Card limit reached ({source})" — for example "(Muffled Nave)" or "(Silencing Peal)" |
| `HERO_SMOLDERING` | "Your hero is Smoldering" |
| `NO_DIRECTION` | "No direction to reverse" |
| `TRUCE` | "Truce: rivals can't be targeted" |
| `RANK_RESTRICTED` | "Can't target Elites or Bosses" |
| `PIECE_SPENT` | "This piece has already acted" |
| `NOT_YOUR_TURN` | "Not your turn" |
| `NO_LOS` | "No clear line" |
| `HAND_FULL` | "Hand full (8)" |
| `POWER_USED` | "Power already used this turn" |
| `DECK_MIN` | "Deck can't go below 8 cards" |

### 15.7 Controls
- **Mouse:** click to select and act, drag cards (or click a card, then a tile), right-click to ping.
- **Touch:**
  - Tap to select and act; long-press to inspect; two-finger tap to ping.
  - End Turn: the first tap shows the Snuff Strike preview and arms the button; the second tap confirms.
- **Pings** are transient messages outside the game log.
- **Keyboard:**

  | Key | Action |
  |---|---|
  | Space | End turn |
  | Enter | Confirm |
  | Z | Undo |
  | 1–8 | Select a card |
  | Tab | Cycle through Ready pieces (only while the board has focus) |
  | Esc | Cancel |
  | P | Hero Power |
  | C | Claim turn (co-op) |
  | D | Deck viewer |
  | H | Hint |
  | I | Toggle the intent overlay |
  | R | Rules overlay |
  | G | Ping |
  | + / − | Zoom |
  | Arrow keys | Keyboard cursor |

---

## 16. Art and Audio Direction

### 16.1 Concept: "Candlelight on a chequer at midnight"
Everything is procedural: SVG, CSS and one canvas particle layer.
- **Wickfolk** are warm, glowing and soft-edged wax figures with dot eyes.
- **Snuff** are cold, silvery-violet smoke with ember eyes.
- **The board** is engraved stone.
- **The UI** looks like vellum, wax seals, brass filigree and stained-glass rune sigils.

### 16.2 Palette
| Token | Hex | Use |
|---|---|---|
| `night_ink` | `#0D0B12` | Page background |
| `crypt_plum` | `#191523` | Panels |
| `velvet_dusk` | `#2A2238` | Raised UI, board frame |
| `engraving` | `#3B3550` | Borders, hatching, tile engraving |
| `flagstone_a` / `flagstone_b` / `grout` | `#24202D` / `#2D2938` / `#15121B` | Board checker |
| `tallow_text` | `#EDE3CC` | Primary text (14.0:1 on `crypt_plum`) |
| `ash_text` | `#A79FB8` | Secondary text (7.1:1 on `crypt_plum`) |
| `candle_gold` | `#F4B942` | Move dots, strike rings, primary accent, Summon frame |
| `flame_core` | `#FFF3C4` | Flame centres, rim light, player damage badges |
| `ember` | `#E8742C` | Rite frame, Burn |
| `blood_wax` | `#E5383B` | Snuff intents only (40% fill and hatching) and incoming damage numbers |
| `verdigris` | `#3FA28C` | Shrines, heals, Charm frame |
| `moonmoth` | `#9FD8E8` | Ward |
| `brass` | `#B8913A` | Rare frame, tempered rim |
| `moonsilver` | `#D9E2F2` | Mythic frame |
| `snuff_body` | `#7E6EA0` → `#5A4C78` | Snuff body gradient. The top reaches 3.5:1 against `flagstone_a` and 3.1:1 against `flagstone_b`. |
| `snuff_rim` | `#B79CFF` | Snuff rim stroke and under-glow (7.0:1 and 6.2:1 against the flagstones) |
| `snuff_eye` | `#FF3B2F` | Enemy eyes |
| `plume_violet` | `#9A5CFF` | Smoke Plumes |
| `gloam_fog` / `gloam_band` | `#4B3A66` / `#7E5BC2` | Zone fog / the warning band, drawn as a pulsing band on the closing ring |
| `guttered_wax` / `molten_core` | `#D9C7A3` → `#8C6B4A` / `#FF9A3C` | The Guttered King |
| `moonfire` | `#7FC8FF` | The Guttered King's flames, Sceptre Sweep rays |
| `moth_silver` | `#C9C3E6` | Moths, Nocturna |
| `tile_pillar` / `tile_rubble` / `tile_chimney` | `#3A3545` (top `#4A4458`) / `#4A3426` / `#5A2E2A` | Tiles |
| `tile_hot_wax` | `#F2A65A` → `#C9612B` | Hazard |
| `matchbook_red` | `#5A1E22` | Card back |
| `sunrise_gold` | `#FFD86B` | Victory, Glory |

- **House colours:** §1.2.
- **Class flame colours** appear only on hero flames, never in board highlights: Paladin `#F4B942`; Witch `#F09AD0`; Lampwright `#5FE0C8`; Duelist a white-hot cinder (`#FFF3C4` core with an `#E8742C` edge), so that red stays the Snuff's colour.
- **Colour-blind shapes** pair with every state: intents are ✕ with hatching, Plumes a spiral, moves a dot, strikes a ring with a sword tick, Ward a hexagon. Houses use their glyphs.

### 16.3 Typography (@fontsource)
| Font | Use |
|---|---|
| **Cinzel Decorative 700** | Logo, screen titles, Victory and Defeat, boss names, phase banners |
| **Cinzel 600/700** | Buttons, labels, card names, Toll titles, every number (HP, ATK, cost, Glory, queue positions), intent labels |
| **EB Garamond 400/500** | Card rules text (15 px minimum at 100% scale), tooltips, How to Play |
| **IM Fell English italic** | Flavour text only |
| `readable_font` | Swaps Cinzel Decorative, IM Fell English and EB Garamond for `system-ui` |

The UI base size is 16 px.

### 16.4 Motifs
- Wax drips along the top edge of cards, panels and HP bars.
- Teardrop flames with two dot eyes.
- Rune sigils (§5.2).
- Moth eyespots on the Moth Die, the defeat screen and Nocturna.
- Bells, matchbook striker strips, brass sconce filigree.
- Chess heraldry: crowns, mitres, towers.

### 16.5 Board and lighting
**Board**
- Two-tone engraved flagstones with a 1 px `engraving` inner line.
- A stone-grain texture: feTurbulence (baseFrequency 0.9, 2 octaves, 8% opacity) **rendered once to an offscreen canvas and reused as a pattern**.
- A carved frame with Cinzel coordinates.

**Tiles**
- Pillar: carved column tops with long shadows.
- Rubble: splintered pews.
- Votive Shrine: a rack of tiny candles glowing verdigris.
- Chimney: a brick ring with a soot vortex rotated by CSS, and a coloured pairing glyph.
- Hot Wax: a glossy pool with bubble pops.
- Gloam: drifting violet fog particles.
- The glyphs for hazard tiles are drawn above the darkness.

**Lighting** is cosmetic. A single canvas darkness overlay `rgba(5,4,10,α)` covers **only the floor layer**, cut with radial light holes:

| Light source | Radius |
|---|---|
| Wickfolk pieces | 2.2 tiles |
| Lanterns and Lit Shrines | 3 tiles |
| Votive Shrines | 1.5 tiles |

- The radius flickers ±4%.
- In Vigil, α = 0.30 + 0.30 × Dread/M.
- In Last Flame, α = 0.30 + 0.30 × (closings done / C).

### 16.6 Pieces (64×64 viewBox per tile; the figure is about 56 px tall)
Each piece is drawn in layers:
1. A shadow ellipse.
2. A wax-seal base in the House colour (Snuff: `snuff_body`), with the movement rune engraved on the left. Pieces whose strike differs from their move add the strike glyph on the right. Below the rune sit the two action pips (boot and sword).
3. **The silhouette:** a body path with a gradient from the House colour to 30% darker, and a `flame_core` rim light at 30% on the upper left. Snuff use the `snuff_body` gradient with a 2 px `snuff_rim` stroke and a cold `#6A4C9C` under-glow ellipse at 50%.
4. 3–5 drip paths.
5. **The flame:** two teardrop paths with a radial gradient from `#FFF3C4` to the class colour. They flicker with **CSS transforms** (scaleY 0.92–1.08, skewX ±4°, 1.6–2.4 s, random phase).
6. **Eyes:** two `#2B1A10` ovals that blink every 4–7 s and glance up to 1.5 px toward the hovered tile.
7. **Stats:** an HP wax drop (bottom left) and an ATK blade (bottom right) in Cinzel Bold. Ward, Burn and Dazed badges sit above, plus a Charm socket.

**Silhouettes**
| Group | Piece | Silhouette |
|---|---|---|
| Heroes (1.2× scale with a halo sigil) | Brannoc | Pillar candle in brass pauldrons, sun shield |
| | Velveteen | Crooked taper in a moth-antenna hat, 3 orbiting moths |
| | Wicklow | Squat lamplighter with a ladder-pole and goggles |
| | Vey | Slim white-hot taper with a rapier and a flame ponytail |
| Units | Taper | Stubby pawn |
| | Taper Captain | Taper with a tiny crown |
| | Wickhorse | Horse-head candle |
| | Incense Acolyte | Mitre and censer |
| | Sconce Squire | Shield candle |
| | Brass Ram | Tower with a ram-head |
| | Velvet Moth | Round fuzzy moth |
| | Silkspinner | Spider-legged candle |
| | Lantern | Hexagonal stained-glass lantern |
| | Wick Mortar | Barrel with a match-cord |
| | Bellows Golem | Bellows torso |
| | Cinderling | Sparking spark-imp |
| | Twinwick | Two-wicked candle with twin knives |
| Snuff | Sootling | Teardrop blob |
| | Gnawmoth | Eyespot moth |
| | Smokehound | Smoke wolf |
| | Ink Wretch | Dripping lancer |
| | Hush Monk | Cowled monk with a handbell |
| | Ash Deacon | Censer-lobber |
| | Knell Banshee | Veiled bell-ghost |
| | Gutter Pawn | Slumped grey pawn with a ladle |
| | Drip Hulk | Melting heap |
| | Snuffer Knight | Cone-helmed horse-knight with a snuffer pole |
| | Hollow Lamplighter | Empty lantern-head |
| | Smokestack | Leaning chimney with eyes |
| | The Clapper | Coal-red bell clapper on smoke legs |

- **Snuff smoke edges** are pre-baked: a path wobbled by seeded noise when the piece is created, then swayed with CSS transforms. There are no per-frame displacement filters.
- **Structures:** a Vigil Candle is a tall altar candle on a brass dish with a 3-segment HP band. A Smoldering Wick is a blackened stub with a single glowing ember.

### 16.7 Cards (240×336 SVG, tarot proportions)
- **Face:** a vellum gradient (`#E9DCC0` → `#D8C6A0`) with an engraved border.
- **Cost:** a red wax-seal cost badge at the top left.
- **Name:** a banner in Cinzel. Tempered cards add "+" and a brass rim.
- **Art window:** a central **procedural sigil** built from the card's `art` data (glyph shapes, accent colour, glow), or the unit's piece SVG.
- **Type ribbon:** Summon shows a chess silhouette, Rite a flame rune, Charm a ring and key.
- **Rules box:** EB Garamond.
- **Rarity frame:** Common tallow; Rare brass with a moving sheen; Mythic moonsilver with an animated gradient shimmer.
- **Card back:** a `matchbook_red` matchbook with a gold moth emblem and a striker strip.
- **Mini card in hand:** cost, name and sigil only.

### 16.8 Bosses (about 3×3 tiles of art over a 2×2 footprint)
- **Hush Hierophant:** a riveted iron bell with a specular band, a smoke robe hem and a glowing coal-red clapper. The clapper swings in phase 2 and detaches as the Clapper in phase 3.
- **The Guttered King:** a mountain of melted candles with a sunken crown of 7 wicks burning `moonfire` blue, a drip beard and a cross sceptre. Crown sockets fill gold on each Checkmate.
- **Nocturna:** moon-white stained-glass wings (Voronoi cells with 2 px ink leading) flapping on a 4-second CSS cycle, blinking eyespots, and a translucent abdomen glowing with eaten light. It brightens when she uses Hunger.
- **Overflow:** boss art is y-sorted with the pieces. It turns 50% transparent when the cursor or a highlight is underneath, and only the footprint is hit-tested.
- **HP bars** are drawn per boss, with phase notches at ⅔ and ⅓: a bell rope (Hierophant), a crown band with 3 sockets (King), and a wing-vein bar (Nocturna).
- **Sky:** a parallax Moth-Moon over the Sconcewick spires, with procedurally flickering windows. Parallax is used on the Title and Boss intro screens only. In play, the sky is a static layer with drifting motes.

### 16.9 Key animations (durations at 1× speed)
| Event | Animation | Duration |
|---|---|---|
| Step / slide | Hop with wax squash-and-stretch; slides leave a flame trail | 180 ms per tile |
| Leap or flying move | Arc 0.6 tiles high, dust puff on landing | 300 ms |
| Melee strike | Lunge to 40% of the path, 12-spark burst, damage number; slides in on a Take | 120 + 80 + 160 ms |
| Ranged / artillery | Ember bolt at 600 px/s; artillery arcs | Distance ÷ 600 px/s |
| Push / bump | Slide with a dust puff; a bump adds a 2 px nudge | 200 ms |
| Ward | A hex shell forms, then shatters into ivory shards when hit | 200 ms |
| Wickfolk death | Melts (scaleY to 0.2) into a puddle, then smoke; a hero leaves a Smoldering Wick | 450 ms |
| Snuff death | Bursts into 24 silver dust particles | 400 ms |
| Intent placed | Red hatch draws in, staggered by queue position, then pulses every 1.2 s | 200 ms |
| Plume / Rise | Smoke column loop; the enemy rises out of the smoke | 450 ms |
| Card play | The card flies to its target, the wax seal cracks, the sigil flashes | 350 ms |
| Moth Die | A CSS 3D cube tumbles and lands on its face glyph | 900 ms |
| Dread +1 | The Hour Candle gutters, a violet vignette pulses | 600 ms |
| Phase change / CHECKMATE | White flash (a fade under reduced motion), shockwave ring, Cinzel Decorative banner, 6 px shake | 1500 ms |
| Victory | A gold radial sunrise wipe; every candle closes its eyes happily | 3 s |

- Particles on the canvas layer are **capped at 300**, and reduced motion turns them off.
- Nothing may flash more than 3 times per second.

### 16.10 Performance rules
- No SVG blend modes per piece.
- No animated `feTurbulence` or `feDisplacementMap`.
- Static filters are rasterised once.
- All looping motion uses CSS transforms or opacity.
- One canvas for darkness and one for particles.
- Bot planning runs off the main thread (§12.6).

### 16.11 Sound event map (WebAudio synthesis, `src/audio`)
Every sound is a recipe in `src/audio/sfxCatalog.ts`, played with `audio.play(name, { pitch, volume, pan })`. The table maps game events to the shipped `SfxName` values.

| Game event | `SfxName` | Options |
|---|---|---|
| UI hover / click / confirm / back | `uiHover` / `uiClick` / `uiConfirm` / `uiBack` | — |
| Greyed card or action clicked (reason shake) | `uiError` | — |
| Timer, last 10 s (once per second) | `uiClick` | pitch 0.6 |
| Select piece | `pieceSelect` | — |
| Step / slide / leap or flying move | `pieceMove` / `pieceSlide` / `pieceLeap` | — |
| Chimney, swap, `castle`, `shadowstep` | `teleport` | — |
| Melee strike / ranged strike | `attackMelee` / `attackRanged` | pitch 0.95–1.05 (cosmetic randomness) |
| Artillery strike | `attackRanged` | pitch 0.8 |
| Damage lands / lethal hit | `hit` / `crit` | — |
| Ward block | `block` | — |
| Wickfolk death / Snuff death | `death` | pitch 1.0 / 1.3 |
| Fire rites (`spark`, `tinder_bolt`, `flare`, `searing_edge`) | `spellFire` | — |
| Moth and Witch rites (`velvet_pull`, `moonlit_hex`, `swarm_of_wings`, `flutterswap`) | `spellNature` | — |
| Dazed and silence effects (`moth_dust`, `silencing_peal`, `ring_bell`) | `spellShadow` | — |
| Holy rites (`dawnbreak`, `aegis_of_dawn`, `kindle_hope`, `relight`) | `spellHoly` | — |
| Moonfire (`sceptre_sweep`) | `spellFrost` | — |
| Heal / Ward gained / Charm attached / Burn or Dazed applied | `heal` / `shield` / `buff` / `debuff` | — |
| Summon | `summon` | — |
| Card draw / hover / play / shuffle / discard at Dawn | `cardDraw` / `cardHover` / `cardPlay` / `cardShuffle` / `cardDiscard` | — |
| Moth Die tumble / landing | `diceRoll` / `diceLand` | landing pitch 1.26 for faces 5–6, 1.0 for 3–4, 0.71 for 1–2 |
| Toll revealed | `eventReveal` | — |
| Dread +1 / Dread threshold crossed | `doomTick` / `doomSurge` | — |
| Glory gained / draft pick, Boon or star | `coin` / `reward` | — |
| Seat turn start / Snuff Move or Strike begins / round start | `turnStart` / `enemyTurn` / `roundStart` | turn start pitch rises by seat (1.0, 1.12, 1.26, 1.33) |
| Gloam closes | `zoneClose` | — |
| Plume rises | `portalOpen` | — |
| Intent placed | `telegraph` | — |
| Boss intro / heavy boss intent lands (`bell_drop`, `ladle_slam`) / `hunger` / phase change / boss death | `bossAppear` / `bossSlam` / `bossRoar` / `bossPhase` / `bossDefeated` | — |
| CHECKMATE | `bossSlam` + `crit` | — |
| Victory / defeat / Last Flame elimination | `victory` / `defeat` / `playerEliminated` | — |

### 16.12 Music (generative, `src/audio/music.ts`)
`audio.setMusic(mood)` crossfades for about 1.5 s.

| Game state | `MusicMood` | Generator (as shipped) |
|---|---|---|
| Title, Setup, Lobby, Chandlery | `menu` | 56 BPM, D, brooding pad, pedal drone, distant bells |
| Regular Nights (Vigil below `deep_dark`; Last Flame before its last regular Night) | `explore` | 68 BPM, A Dorian |
| Vigil at `deep_dark` or above; Last Flame's last regular Night | `battle` | 100 BPM, E Phrygian, brass stabs |
| Boss Night | `boss` | 132 BPM, C♯, dissonant brass and choir |
| Victory screen | `victory` | 92 BPM, D Ionian fanfare, then a calm pad |
| Defeat screen | `defeat` | 50 BPM, C, descending lament |

---

## Appendix A: Data Files and ID Registry

### A.1 Registry
**Data files:**
- Content lives in `/content/*.json`. Each file is validated against its JSON Schema on load, and errors show in the Codex.
- Files: `heroes`, `units`, `cards`, `enemies`, `bosses`, `boss_intents`, `tolls`, `omens`, `heirlooms`, `boons`, `tiles`, `tokens`, `statuses`, `ranks`, `houses`, `bots`, `runes`, `sites`, `maps`, `difficulty`, `lengths`, `config_defaults`, `reasons`.

| Category | Ids |
|---|---|
| Modes | `vigil`, `last_flame` |
| Heroes | `sconce_paladin`, `moth_witch`, `lampwright`, `ember_duelist` |
| Hero Powers | `lantern_oath` (sconce_paladin), `flutterswap` (moth_witch), `castle` (lampwright), `shadowstep` (ember_duelist) |
| Hero traits | `stalwart`, `mothmaker`, `quick_build`, `flourish` |
| Units | `taper`, `taper_captain`, `wickhorse`, `incense_acolyte`, `sconce_squire`, `brass_ram`, `velvet_moth`, `silkspinner`, `lantern`, `wick_mortar`, `bellows_golem`, `cinderling`, `twinwick` |
| Cards | The 40 ids in §7.3 |
| Enemies | `sootling`, `gnawmoth`, `smokehound`, `ink_wretch`, `hush_monk`, `ash_deacon`, `knell_banshee`, `gutter_pawn`, `drip_hulk`, `snuffer_knight`, `hollow_lamplighter`, `smokestack`, `clapper` |
| Bosses | `hush_hierophant`, `guttered_king`, `nocturna` |
| Boss intents | `bell_drop`, `hushwave`, `silencing_peal`, `ladle_slam`, `sceptre_sweep`, `wax_spit`, `wing_gust`, `hunger`, `dust_storm` |
| Ranks | `minion`, `soldier`, `elite`, `structure`, `boss`, `hero`, `unit` (Snuff use the first five; Wickfolk use hero, unit and structure) |
| Unit traits | `promotion`, `censer`, `shieldbearer`, `battering`, `webs`, `heavy`, `pop`, `twin_knives` |
| Enemy traits | `crown`, `wax_pool`, `belch` |
| Runes | `rune_crown`, `rune_horse`, `rune_tower`, `rune_mitre`, `rune_star`, `rune_pawn`, `rune_wing`, `rune_arc`, `rune_bolt`, `rune_anchor` |
| Tiles | `flagstone`, `pillar`, `rubble`, `votive_shrine`, `chimney`, `hot_wax` |
| Overlays and structures | `gloam`, `gloam_warning`, `vigil_candle`, `smoldering_wick` |
| Tokens | `smoke_plume`, `lit_shrine`, `first_light`, `crown_socket`, `bounty_seal` |
| Statuses | `ward`, `burn`, `dazed` |
| Moth Die faces | `eclipse`, `smoke`, `stillness`, `long_shadows`, `kindling`, `bright_wings` |
| Tolls | `candlemas_blessing`, `lucky_wick`, `hearthwind`, `peddler_of_wicks`, `moth_migration`, `soot_fog`, `bell_of_embers`, `waxen_rain`, `ill_omen`, `crumbling_nave`, `restless_soot`, `shifting_chimneys`, `muffled_nave`, `black_sun` |
| Heirlooms | `ever_burning_wick`, `brass_thimble`, `lamplighters_hook`, `moth_velvet_cloak`, `candlemakers_mold`, `bell_of_saint_tallow` |
| Boons | `heirloom`, `temper`, `prune` |
| Sites and maps | `cathedral_of_tallow`, `soot_market`, `belfry_steps`, `the_waxworks`, `first_vigil`, `hollow_nave`, `last_flame_ring` |
| Difficulty | `candlelit`, `dusk`, `midnight`, `witching_hour` |
| Length | `short`, `standard`, `long` |
| Dread thresholds | `dimming`, `deep_dark`, `long_night_falls` |
| Houses | `house_beeswax`, `house_tallow`, `house_bayberry`, `house_rushlight` |
| Bots | `bot_apprentice`, `bot_warden`, `bot_elder` |
| Phases | `night_setup`, `boss_intro`, `toll`, `omen`, `snuff_move`, `players`, `snuff_strike`, `rise`, `tally`, `dawn`, `chandlery`, `game_over` |
| AI preferences | `candles`, `heroes`, `light`, `clusters`, `nearest` |
| Area shapes | `single`, `line`, `beam2`, `side2`, `ring8`, `ring12`, `square3`, `plus5`, `block2x2` |
| Free actions | `melt`, `ring_bell` |
| Custom effect ops | `smothered_mate`, `devour_light`, `hollow_bell` |
| Reason codes | §15.6 |

**Area shapes**
Every shape is defined relative to an anchor and a rotation (N, E, S, W):
- `single`: one tile.
- `line`: a 1-wide ray of length `range`.
- `beam2`: a 2-wide ray from one side of a 2×2 footprint.
- `side2`: the 2 ring tiles along one side of a 2×2 footprint.
- `ring8`: the 8 tiles around a 1×1.
- `ring12`: the 12 tiles around a 2×2.
- `square3`: a 3×3 square centred on the anchor.
- `plus5`: the centre plus its 4 orthogonal neighbours.
- `block2x2`: a 2×2 block whose anchor is its lowest file and rank.

### A.2 Schemas
**Pattern**
```json
{ "type": "step|slide|leap|immobile", "dirs": "orth|diag|all", "range": 3,
  "offsets": "knight", "flying": false }
```
- `range: null` means "to the board edge".
- `offsets` is used only with `leap`.
- The pawn uses `move: {"type":"step","dirs":"orth","range":1}` with `attack.reach: {"type":"step","dirs":"diag","range":1}`.

**Attack** (one schema for heroes, units, enemies and boss intents)
```json
{ "kind": "melee|ranged|artillery|none",
  "reach": "as_move",
  "area": "single", "dirs": "orth", "range": 4, "minRange": 1,
  "firstHit": true, "pierce": false, "los": true,
  "damage": "atk", "push": 0, "pull": 0, "status": null,
  "take": true, "hits": "all" }
```
- `reach` is a Pattern or `"as_move"`, and is used by melee attacks only.
- **Validation:** `take` is allowed only when `kind` is `melee`. Artillery forces `los: false`. `firstHit` and `pierce` are mutually exclusive.

**Effect ops** (shared by cards, traits, Powers, Tolls, Moth Die faces and bosses)
`damage`, `heal`, `ward`, `burn`, `daze`, `push`, `pull`, `swap`, `teleport`, `summon`, `transform`, `extra_move`, `extra_strike`, `gain_flame`, `draw`, `create_tile`, `move_tile`, `reverse_intent`, `attach_charm`, `modify_rule`, `melt`, `relight`, `add_dread`, `add_glory`, `place_plume`, `remove_plume`, `custom` (registry ids only: mods may reference them but not define new ones).

**Targets:** `target.kind` is `piece`, `tile`, `direction` or `board`. `target.side` is `enemy`, `ally`, `own` or `any`. `target.range.from` is `hero`, `piece`, `any_own` or `board`. Optional flags: `los`, `ranks`.

**Card example**
```json
{ "id": "shield_bash", "name": "Shield Bash", "type": "rite", "cost": 1, "rarity": "common",
  "class": "sconce_paladin", "starter": true,
  "target": { "kind": "piece", "side": "enemy", "range": { "from": "hero", "max": 1 } },
  "effects": [ { "op": "damage", "amount": 2 }, { "op": "push", "distance": 2, "from": "hero" } ],
  "art": { "sigil": ["shield", "flame"], "accent": "#F4B942" } }
```

**Hero example**
```json
{ "id": "moth_witch", "name": "Velveteen", "title": "the Moth Witch", "hp": 6, "atk": 2,
  "move": { "type": "leap", "offsets": "knight" },
  "attack": { "kind": "melee", "reach": "as_move", "area": "single", "damage": "atk", "take": false },
  "trait": "mothmaker", "power": "flutterswap", "powerCost": 2,
  "starters": ["loose_a_moth", "velvet_pull", "moth_dust"], "flame": "#F09AD0" }
```

**Enemy example**
```json
{ "id": "ink_wretch", "name": "Ink Wretch", "faction": "snuff", "rank": "soldier", "glory": 2,
  "hp": 2, "atk": 1, "move": { "type": "slide", "dirs": "orth", "range": 2 },
  "attack": { "kind": "ranged", "area": "line", "dirs": "orth", "range": 4, "firstHit": true,
              "damage": "atk", "push": 1, "take": false },
  "ai": { "prefers": "candles" }, "weight": { "1": 2, "2": 2, "3": 1 }, "immune": [] }
```

**Toll example**
```json
{ "id": "black_sun", "name": "Black Sun", "kind": "curse", "requires": ["plumes"],
  "effects": [ { "op": "modify_rule", "rule": "plumes_per_placement", "delta": 1 } ],
  "reward": "chandlery_take_two" }
```

**Boss example**
```json
{ "id": "guttered_king", "name": "The Guttered King", "epithet": "Monarch of Melted Wax",
  "size": [2, 2], "hp": { "base": 18, "perPlayer": 12 },
  "immune": ["displacement", "gloam", "hot_wax"],
  "special": { "op": "custom", "id": "smothered_mate", "damagePct": 15, "maxCrowns": 3 },
  "phases": [
    { "move": { "type": "step", "dirs": "all", "range": 1 },
      "intents": ["ladle_slam", "sceptre_sweep"] },
    { "enterAt": [2, 3], "move": { "type": "step", "dirs": "all", "range": 1 },
      "intents": ["ladle_slam", "sceptre_sweep", "wax_spit"],
      "onEnter": [ { "op": "summon", "unit": "gutter_pawn", "count": { "byPlayers": [1, 1, 2, 2] },
                     "near": { "anchor": "self" },
                     "modeOverrides": { "last_flame": { "unit": "drip_hulk" } } } ] },
    { "enterAt": [1, 3], "move": { "type": "step", "dirs": "all", "range": 1 },
      "intents": ["ladle_slam", "sceptre_sweep", "sceptre_sweep", "wax_spit"],
      "onEnter": [ { "op": "create_tile", "tile": "hot_wax", "area": "ring12", "onlyEmpty": true } ] } ] }
```
`"enterAt": [a, b]` means the phase starts when HP ≤ ⌊max HP × a / b⌋.

**`immune` vocabulary:** tile ids, status ids, `displacement`, `gloam`, `snuff_attacks`. Every boss implicitly has `displacement`, `gloam` and `snuff_attacks`.

### A.3 Validation and mods
- **Pass 1:** JSON Schema validation.
- **Pass 2:** reference and sanity checks.
  - Every referenced id exists.
  - Numbers are in range: HP 1–99, cost 0–9, range 1–12 or null.
  - Scripted maps fit their board.
  - Each class has 3 starters.
- **Mods:**
  - Loaded as JSON from the Codex, with a 1 MB limit.
  - Online, the server validates the host's mod, and every client must match its `contentHash`.
  - Mods disable Daily.

---

## Appendix B: Engine and Netcode

### B.1 Rules engine
A pure TypeScript reducer, `reduce(state, action) → state`, shared by the client and the Node server (`server/index.ts`).

| Function | Purpose |
|---|---|
| `createGame(config, seed)` | Builds the initial state. |
| `legalActions(state, seat, selection)` | Lazy enumeration for the selected piece or card. Drives highlights. |
| `validateAction(state, seat, action)` | Returns `ok` or a reason code (§15.6). Used by the server and for greyed-out reasons. |
| `intentQueue(state)` | Feeds the right-rail queue (resolution order). |
| `previewSnuffStrike(state)` | The End Turn preview and danger badges. Runs the real resolution on a clone. |
| `planBotTurn(state, seat, level)` | Bot planning with node budgets (§12.5). |
| `hint(state, seat)` | The Hint button. |
| `viewFor(state, seat)` | Filters hidden information. |
| `hashState(view)` | Hash of a seat's view, for sync checks. |

### B.2 Actions (snake_case)
- **Player:**
  - Pieces and cards: `move`, `strike`, `relight`, `light_shrine`, `play_card`, `use_power`, `free_action` (`melt`, `ring_bell`).
  - Turn flow: `end_turn`, `undo`, `claim_turn`, `concede`.
  - Night setup and choices: `deploy`, `ready`, `choose_toll`, `carry_over`, `haunt`, `retry_night`.
  - Chandlery: `draft_pick`, `skip_pick`, `boon_pick`.
- **Setup:** `config_set`, `start_game`.
- **System:** `advance` steps the automated phases. The server issues it online; the local client issues it offline.
- **Outside the reducer:** pings are transient messages and never touch the log or the hash.

### B.3 Randomness
- **Generator:** mulberry32, as in `src/engine/rng.ts`. Each named stream keeps its own uint32 state inside the game state.
- **Streams:** `setup`, `map`, `spawn`, `omen`, `toll`, `decks:<seat>`, `draft:<seat>`, `bot:<seat>`.
- **Seeding:** each stream is seeded with `seedFromString(seed + "\u0000" + stream)` (FNV-1a, already in `rng.ts`).
- **Logging:** every random result is written to the action log, so replays, undo boundaries and Retry this Night are exact.
- **Cosmetic randomness** (pitch variation, particles, flicker phase) uses `Math.random` and never touches the game state.
- **Online seed secrecy:** the server combines the seed with a secret salt (`seed + "\u0000" + salt`). The salt is logged and revealed at `game_over`, so a client cannot compute rivals' hands.

### B.4 Online play
- **Authority:** the server validates every action with `validateAction`. It broadcasts accepted actions, and sends each seat `hashState(viewFor(state, seat))` after each action. A client whose hash differs is resynced from the log.
- **Hidden information:**
  - Last Flame hides other players' hands and all deck orders.
  - Vigil hides deck orders only.
  - The server resolves information-revealing steps (draws, shuffles, Plume contents in Last Flame) and sends per-seat `reveal` events: card ids to the owner, counts to everyone else.
- **Pacing:** the server paces `advance` with a fixed playback budget (the 1× animation duration, capped at 6 s per automated phase). Faster clients wait; slower clients fast-forward.
- **Claims:** Vigil `claim_turn` requests are ordered by server receipt time.
- **Disconnects and lobby rules:** §11.6.

### B.5 Typical session lengths (targets, matching §14.3)
| Mode | Preset | Length |
|---|---|---|
| Quick Play (solo Vigil) | `short` | 20 min |
| Vigil, solo | `standard` | 35 min |
| Vigil, solo | `long` | 55 min |
| Quick Last Flame (you + 2 bots, 10×10) | `short` | 30 min |
| Last Flame, 4 humans, `normal` timer | `standard` | 60 min |
| Last Flame, 4 humans, `normal` timer | `long` | 80 min |

### B.6 Required tests
- **Tutorial lines:** for each hero, replay the §15.2 guaranteed line through `reduce`. Assert a double kill, Dread +0, and Flame spent ≤ 3.
- **Preview parity:** `previewSnuffStrike(state)` equals the state after `advance` through `snuff_strike`, on 1,000 seeded positions.
- **Determinism:** the same seed and action log give the same `hashState` on client and server.
- **Bots:** the same seed gives the same bot plan at each level.
- **Settings code:** round-trips, and a code with unknown keys produces the toast.
- **Boss maths:** the HP formula and phase thresholds for P = 1–4 and every difficulty.
- **Gloam schedule:** the §13.2.8 table for every board and length combination.

---

## Appendix C: Design Decisions

This version rewrites §1–§13 in full, so every cross-reference resolves. It applies the reviewers' fixes for clarity, simplicity and correctness. The table lists the fixes that were rejected or changed, with the reason.

| Proposal | Decision | Reason |
|---|---|---|
| Merge the Moth Die (Omen) into Tolls and remove it | **Partly rejected.** Vows were merged into Tolls (the Curse reward). The Moth Die stays, rolled every round, with faces labelled by effect. | The brief asks for standard board-game elements. A visible die roll is the most familiar one, and it needs no player decision. It is off in the first game. |
| Give every piece a facing for "forward" | **Rejected.** `forward` was removed. Pawns move 1 orthogonal step and strike 1 diagonal step in any direction. | Facing adds a hidden state to every piece. The pawn keeps its chess identity without it. |
| Define `the_match` as a separate token | **Rejected.** `initiative_coin` and `the_match` are merged into `first_light`. | One first-player token is easier to read. |
| Vigil defeat when every hero is Smoldering | **Rejected.** Heroes self-relight at Tally for +1 Dread. | Dread stays the single loss track, and a solo player cannot lose instantly to one bad Snuff Strike. |
| Keep closing the Gloam after the boss dies, until the boss rounds run out | **Rejected.** The game ends at the end of the round in which the boss falls. | It is a shorter, clearer finale, with no dead rounds. |
| A 5-round cap for the Vigil Boss Night | **Rejected.** The Vigil boss has no cap; Dread +1 at every Tally is the clock. | It uses an existing system, and earlier play still matters. |
| Boss Glory +1 per 25% of max HP | **Changed** to +1 per full 10%, plus +2 for the killing blow. | 25% made the finale worth only 5 Glory in total. Splitting by damage share still stops kill-stealing. |
| Switch the RNG to xoshiro128** | **Rejected.** Keep the shipped mulberry32, one state per named stream. | It is already implemented, serializable and deterministic. Streams fix the coupling problem. |
| Co-op `retry_night` off by default | **Rejected.** The difficulty default applies to co-op too, and a retry needs a unanimous vote. | The vote already protects co-op. Fewer special cases. |
| Random Toll in Quick Play | **Rejected.** The Toll stays a choice (Blessing or Curse). The timer and Easy bots pick the Blessing. | It is a short, meaningful decision. Quick Play's first game has no Tolls anyway. |
| Restless Flame and Hunted Flame trigger definitions | **Moot.** Both systems were cut. | The Gloam already stops turtling. Fewer anti-stall rules. |
| Vigil Toll chooser = first claimant | **Changed** to the First Light holder, which rotates each Dawn. | It is fair, visible and uses the existing token. |
| Snuff use Chimneys | **Rejected.** Only Wickfolk use Chimneys. | It keeps enemy movement predictable and the AI simple. |
| Original sound recipes and music layers (heartbeat, choir) | **Replaced** by a mapping to the shipped `src/audio` catalog and moods. | The audio is already built and tested. The design now matches the code. |
| Grenze Gotisch for boss names; Uncial Antiqua for Tolls | **Cut.** Boss names use Cinzel Decorative and Tolls use Cinzel. Rules text moves to EB Garamond. | Fewer typefaces, better rules readability. Three of the four are already installed. |
| Snuff body `#6A5A88` (suggested for 3:1) | **Changed** to `#7E6EA0`. | `#6A5A88` measures only 2.3–2.6:1 against the flagstones. `#7E6EA0` measures 3.1–3.5:1. |
| `bellfry_steps` | **Renamed** `belfry_steps`. | Correct spelling. |
| Renames accepted from review | `sconce_knight` → `sconce_paladin`; `bot_squire` / `bot_knight` / `bot_sage` → `bot_apprentice` / `bot_warden` / `bot_elder`; `gutterblade` → `twinwick`; `drip_golem` → `drip_hulk`; `wickgnawer_moth` → `gnawmoth`; `toll_of_silence` → `silencing_peal`; `the_hush` → `muffled_nave`; `check` → `sceptre_sweep`; `long_night` → `witching_hour`; `bounty_crown` → `bounty_seal`; Relic → Charm; `colorblind_shapes` → `bold_outlines`; `omen` file → `omens`; settings prefix `WW1:` → `WAX1:`. | Chess names only on pieces that move like that piece. Wickfolk and Snuff no longer share prefixes. "Toll", "Hush" and "Check" are no longer overloaded. |
| Removed ids | `rekindle` (replaced by the generic `relight`), `vow_*` and the `vow` phase, `initiative_coin`, `the_match`, `restless_flame`, `hunted_flame`, `snuff_phase_speed` (now `enemy_turn_speed`), `ambience_volume` (ambience plays on the music bus), the `roll_die` op, the `queen` direction (`all` covers it), the `forward` direction, and the `x5`, `band2` and `block2x3` area shapes. | Unused or duplicated. |

### C.1 Clarifications from implementation

Rules questions the GDD left open or contradicted, as the engineers settled them (recorded in their
hand-off notes). They are clarifications, not changes to the design above.

| Topic | Decision | Note |
|---|---|---|
| Smoldering Wicks and line of sight (§5.3 vs §5.4) | **Wicks do not block line of sight**; they still block movement. (`SMOLDERING_WICK_BLOCKS_LOS` in `src/engine/state.ts`.) | Follows the overlay table in §5.4. |
| Kill credit for Snuff hits (Vigil, §6.3) | The victim's last displacer this round, else the attacker's, else whoever reversed the intent. | Last Flame uses a clock instead (below). |
| Optional picks (Sunshield Charge's hit, §7.3) | An optional pick may be left out **only when it has no valid choice**. | Skipping a pick that has a valid choice is rejected (`INVALID_TARGET`). |
| Moves against immune pieces | A pick whose effects only move a piece that is immune to that move is not offered (reason `IMMUNE`). Castle ignores immunity. | Covers Feint, Ember Waltz, Flutterswap and Velvet Pull. |
| Charms on a fallen hero (§7.1) | Charms stay on a Smoldering hero (Riposte answers the fatal hit). A Charm returns to the discard pile of the seat that played it. | |
| Brass Thimble, Swarm of Wings | Brass Thimble raises max HP **and** current HP by 2. Swarm of Wings readies every Velvet Moth you own, even ones that already acted. | |
| Undo commit points (§6.10) | Any draw, shuffle, Plume placed or RNG stream advanced. Ids keep counting after an undo. | |
| Retry this Night (§13.1.7) | Allowed from the boss intro to the Tally, and from the defeat screen. It restores the night_setup snapshot exactly, ids and log included. | |
| Boss spawn timing (§13.2.9, §13.3) | The boss spawns at the Boss Night's night_setup, before the initial enemies and Plumes; `boss_intro` is only the intro screen. | The initial enemies and Plumes avoid its footprint; the Retry snapshot includes the boss. |
| Boss intent ties (§10.5) | After each intent's listed criteria, Candles are a last criterion (Ladle Slam, Sceptre Sweep, Wing Gust, Dust Storm), then reading order. | The GDD names only heroes and Wickfolk. |
| Turnabout on a boss | Reverses **every reversible** intent of that boss. Hushwave (centred) and Silencing Peal (global) cannot be reversed. | A boss with only those gives `NO_DIRECTION`. |
| Boss death (§10.1) | Also clears every Plume on the board. Devour Light heals at most once per Hunger. CHECK! fires when the King's escapes change to 1 or 2. | Plumes hold Snuff. |
| Last Flame: no Dawn relight (§13.2.6, §13.6) | A Wick stays until its owner's next seat turn, even across Nights. A respawn also returns the hero's Charm. | Includes the Boss Night. |
| Last Flame: falling in the Gloam | A hero that falls on a Gloam tile is eliminated at once. | Smoldering pieces never take damage; the Gloam step handles Wicks. |
| Elimination bands (§13.2.6) | One band per player action, per intent, or per Tally step; any other elimination gets a fresh band. | |
| Last Flame end checks (§13.2.9) | Run at Tally step 9 on any Night, so "one or no heroes standing" can end the game before the Boss Night. Reason priority: boss fell, then last standing, then boss rounds. | |
| Survival bonus (§13.2.2) | The +5 is awarded as Glory at the end: `Standing.glory` excludes it, `score` includes it. | |
| Glory leader and Bounty (§13.2.4) | Eliminated seats count for the leader. The Bounty uses the leader as it stood before that fall's Glory. | |
| Last Flame kill credit | A Snuff kill goes to the most recent displacer or reverser (a clock); a Burn kill to the seat that applied the Burn; Gloam and Hot Wax kills to whoever displaced the piece that round. | Vigil keeps the fixed order above. |
| Haunting details (§13.2.7) | Off when `neutrals` is off. Skips do not reset "same hero twice in a row". A seat with no legal tile is skipped. Bots haunt the highest-Glory living hero from the closest legal tile. | |
| Concede in Last Flame | No vote: the seat is eliminated and keeps its Glory. When no human seat is left, the game ends (`conceded`). | |
| Online content (§11.6, A.3) | The server plays the base content only; a client with a mod loaded is refused with `content_mismatch`. Every update carries the seat's full view (no hash resync). | |
