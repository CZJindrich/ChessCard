# Wickwatch — Rules Reference

*Living candles hold back the smoke until dawn.*

This is the player's rulebook: everything you need at the table, in plain words. The full design
(every number, edge case and id) is in [`GDD.md`](GDD.md). The tables marked *generated* are built
from the game's content files by `npx tsx scripts/rules-tables.ts`, so they always match the game
you are playing (mods excepted).

---

## 1. The goal

You command a **Lanternwarden** — a living candle — plus the small wax folk you summon, on a stone
chequer. Every Night the **Snuff**, smoke-creatures that want every light out, pour onto the board.
The last Night of every game is a **Boss Night**.

| Mode | Players | How you win |
|---|---|---|
| **Vigil** (co-op) | 1–4, solo included; any seat can be an AI ally | Keep the three **Vigil Candles** lit and survive each Night. On the Boss Night, **slay the boss**. You all lose together if **Dread** fills the Hour Candle. |
| **Last Flame** (battle royale) | 2–4, at least one human; the rest are bots | Earn the most **Glory**. A ring of smoke, the **Gloam**, closes in Night by Night, and on the last Night a boss rises in the middle and attacks everyone. |

A game is a few **Nights**, the last one the Boss Night. In Vigil the Boss Night has no round cap —
Dread is the clock; in Last Flame it lasts a set number of boss rounds. *(generated)*

<!-- generated:lengths -->
| Length | Rounds per Night | Vigil Nights | Last Flame Nights | Last Flame boss rounds |
| --- | --- | --- | --- | --- |
| **Short** | 4 | 3 (2 + Boss Night) | 3 (2 + Boss Night) | 5 |
| **Standard** | 4 | 4 (3 + Boss Night) | 4 (3 + Boss Night) | 5 |
| **Long** | 4 | 6 (5 + Boss Night) | 5 (4 + Boss Night) | 6 |
<!-- /generated:lengths -->

## 2. A round

A round runs in this order. The middle three — **Snuff Move → Your turns → Snuff Strike** — are the
beats the top bar lights up as they happen.

1. **Moth Die** — a six-sided die sets a small twist for the round (§10).
2. **Snuff Move** — the boss, then every enemy, moves and **declares its attack**: the target
   tiles turn red, with a ✕, a damage number and push arrows. These *intents* are locked in.
3. **Your turns** — every player takes a seat turn (§3).
4. **Snuff Strike** — the intents resolve one at a time, in queue order (the numbers 1, 2, 3 … on
   the board and in the right-hand queue).
5. **Rise** — an enemy climbs out of every Smoke Plume (§6).
6. **Tally** — Burn, Hot Wax, healing and the other end-of-round effects; new Plumes appear.

Red always means *a Snuff threat*, and every threat is shown **before** you act. Each turn is a
readable puzzle: kill the attacker, push it, block it, or step out of the red.

In **Vigil**, players act in any order, one at a time (click your plaque or press **Take My Turn**
online); AI allies go after the humans. In **Last Flame**, seats go clockwise from the holder of
**First Light**, which passes on at every Tally.

## 3. Your seat turn

**At the start** you draw up to **5 cards** and get **3 Flame** (you can never hold more than 6).
Your pieces become **Ready** — except pieces that arrived since your last turn, which are
**Exhausted** until your next one.

**During your turn**, in any order:

- **Move and Strike.** Each Ready piece may **Move once and Strike once, in either order** (the
  boot and sword pips on its base). Pieces move like chess pieces; the rune on the base says how.
- **Melee pieces strike where they could move**, and a melee kill **takes the square** — the
  striker steps onto the victim's tile for free. *Pawns* (Tapers, Gutter Pawns) are the exception:
  they move one step straight and strike one step diagonally, in any direction.
- **Ranged pieces** shoot along a line and hit the first piece in it; **artillery** lobs over
  everything at a tile within its range. Both stay put.
- **Play cards** and use your **Hero Power** once (§4). Cards never use a piece's Move or Strike.
- **Relight** a fallen ally (Vigil): a piece next to a Smoldering Wick spends its Strike to
  relight it (§7).
- **Light a Votive Shrine**: a piece on or next to one spends its Strike to light it.
- **Melt** one of your own units (free).
- **Undo** (Z) your own actions this turn, back to the last moment something random or hidden
  was revealed (a draw, a shuffle, a Plume).

**At the end**, unspent Flame is lost and "this turn" effects end.

**Damage.** A piece at 0 HP dies at once: wax folk melt, Snuff burst into dust. A hero becomes a
**Smoldering Wick** instead (§7). **Push** moves a piece tile by tile; if it hits something (a
piece, a Pillar, a Candle, the edge) it stops and takes **bump 1** — and so does the piece it hit.

## 4. Cards and Flame

Every deck starts with **10 cards**: 2 Spark, 1 Light a Taper, 1 Mend the Wick, and two copies
each of your hero's three class cards. You add cards at the Chandlery between Nights (§11).

| Type | Frame | What it does |
|---|---|---|
| **Summon** | gold | Puts a unit on an empty tile within 2 of your hero (never on a Plume). It arrives Exhausted and acts from your next turn. |
| **Rite** | ember | Happens at once. |
| **Charm** | verdigris | Attaches to a piece until Dawn (one Charm per piece). |

- "Within N" counts from **your hero**. While your hero is Smoldering, those cards can't be played.
- **Hand limit 8**: a draw at 8 cards is skipped. An empty deck reshuffles your discard pile.
- **Unit limit 4** non-hero pieces per player (structures and Moths included).
- A card you can't use turns grey and tells you why ("Need 2 Flame", "No enemy in range", …).

### Heroes and their powers *(generated)*

Heroes are unique within a game. Each has a trait that is always on and a **Hero Power** that
costs Flame and can be used once per turn (not while Smoldering).

<!-- generated:heroes -->
| Hero | HP | ATK | Moves | Strikes | Trait | Hero Power |
| --- | --- | --- | --- | --- | --- | --- |
| **Brannoc**, the Sconce Paladin | 8 | 2 | King step | Melee, as move | **Stalwart**: Cannot be pushed or pulled. | **Lantern Oath** (2 Flame): Brannoc and every allied piece adjacent to him gain Ward. |
| **Velveteen**, the Moth Witch | 6 | 2 | Knight leap | Melee, as move | **Mothmaker**: A Snuff Minion or Soldier killed by her Strike becomes a Velvet Moth you own on that tile (Exhausted, if the unit limit allows). Never for rivals or bosses. Her strikes never Take. | **Flutterswap** (2 Flame): Swap two single-tile, non-structure pieces within 3 of Velveteen. She may be one of them. |
| **Wicklow**, the Lampwright | 6 | 2 | Rook slide 3 | Ranged line, orthogonal, range 4, first hit | **Quick Build**: His Lanterns and Wick Mortars arrive Ready. | **Castle** (1 Flame): Wicklow swaps places with one of his Lanterns or Wick Mortars anywhere on the board. |
| **Vey**, the Ember Duelist | 6 | 2 | Bishop slide 3 | Melee, as move | **Flourish**: When her own Strike kills, she gets 1 extra Strike this seat turn (at most 2 per seat turn). | **Shadowstep** (1 Flame): Move Vey to an empty, enterable tile adjacent to an enemy within 4 of her. This does not use her Move. |
<!-- /generated:heroes -->

## 5. Enemies and intents

- Every enemy (except the Smokestack) declares **exactly one intent** per Snuff Move.
- An intent **aimed by an enemy moves with it**: push or pull the attacker and its red tiles
  follow; kill it and the intent is gone. **Turnabout** reverses an intent; **Dazed** cancels it.
- The Snuff hit **everything** on their red tiles — other Snuff included — but never a boss.
- Snuff pick targets by a fixed preference (Candles, heroes, light, clusters or nearest), lethal
  targets first. There is no hidden randomness in what an enemy will do next turn.

<!-- generated:enemies -->
| Snuff | Rank | HP | ATK | Moves | Attack |
| --- | --- | --- | --- | --- | --- |
| **Sootling** | Minion | 1 | 1 | King step | Melee: strikes 1 adjacent tile. Prefers Candles. |
| **Gnawmoth** | Minion | 1 | 1 | Queen slide 3, flying | Flying. Melee: strikes 1 adjacent tile. Prefers light. |
| **Smokehound** | Soldier | 2 | 1 | Queen slide 2 | Melee: strikes 1 adjacent tile and pushes 1. Prefers heroes. |
| **Ink Wretch** | Soldier | 2 | 1 | Rook slide 2 | Lances the first piece in an orthogonal line, range 4, pushing 1. Prefers Candles. |
| **Hush Monk** | Soldier | 3 | 1 | 1 orthogonal step | Rings all 8 tiles around itself and applies Dazed. Centred: cannot be reversed. |
| **Ash Deacon** | Soldier | 2 | 1 | King step | Artillery: a plus-shaped blast centred on a tile at distance 2-4. Prefers clusters. |
| **Knell Banshee** | Elite | 4 | 2 | Bishop slide 3, flying | Flying. Wails down a diagonal line, range 3, hitting every piece on it. Prefers heroes. |
| **Gutter Pawn** | Minion | 2 | 1 | Pawn | Guttered King summon. Immune to Hot Wax. Crown (Vigil): on rank 1 it becomes a Drip Hulk. |
| **Drip Hulk** | Elite | 6 | 2 | 1 orthogonal step | Melee: strikes 1 orthogonally adjacent tile, pushing 1. Immune to Hot Wax. Wax Pool: dies into Hot Wax. |
| **Snuffer Knight** | Elite | 4 | 2 | Knight leap | Leaps like a knight and strikes 1 knight-offset tile. Prefers heroes. |
| **Hollow Lamplighter** | Elite | 5 | 2 | Rook slide 2 | Shoots the first piece in an orthogonal line, range 5. Prefers light. |
| **Smokestack** | Structure | 4 | 0 | Immobile | Structure. No attack. Belch: at each Plume placement, adds a Sootling Plume within 2. |
| **The Clapper** | Elite | 5 | 2 | King step | Hush Hierophant phase 3 summon. Rings all 8 tiles around itself. Centred. |
<!-- /generated:enemies -->

## 6. Smoke Plumes

A violet spiral is a **Smoke Plume**: an enemy (its ghost shows which) **rises from it after the
Snuff Strike**, and the new enemy acts from the next round.

- **Stand on it** to block it: the piece takes 1 damage (Ward absorbs it) and nothing rises.
- **Strike it** (or hit it with a damaging card) to pop it. There is no Take, and no Glory.
- A Snuff standing on it also stops it. Summons can never be placed on a Plume.

## 7. Falling, relighting and Dread (Vigil)

A hero at 0 HP becomes a **Smoldering Wick** on its tile. Its units still act. An adjacent ally can
**relight** it by spending its Strike: the hero comes back at the end of that turn with half its
max HP (rounded up), Exhausted. A hero still Smoldering at the Tally relights itself with 1 HP — at
the cost of Dread. At Dawn every hero relights.

**Dread** is the Vigil's only loss track, shown on the Hour Candle (12 by default; see §12). It
carries over between Nights. *(generated)*

<!-- generated:dread -->
| Event | Dread |
| --- | --- |
| A Vigil Candle is hit (each damage instance) | +1 |
| A Vigil Candle is snuffed (on top of the hit) | +1 |
| A hero falls | +1 |
| A hero relights itself at the Tally | +1 |
| Each Tally on the Boss Night (the boss tolls) | +1 |
| Dawn of a regular Night, per Candle still lit | −1 (never below 0) |
<!-- /generated:dread -->

**Stars** on victory: ★ win; ★★ win with Dread under ⅔ of the Hour Candle; ★★★ win with Dread under
⅓ and no Retry used. **Retry this Night** (when the difficulty allows it) restarts the current Night
exactly as it began; in co-op it needs everyone's vote.

## 8. Last Flame

Everything above applies, with these changes:

- **No Candles, no Dread.** Score **Glory** instead. Highest final score wins; heroes still
  standing at the end get the survival bonus.
- **Truce on Night 1** (by default): no targeting, damaging, pushing or Dazing rivals. Redirecting
  a Snuff onto a rival is allowed but earns nothing.
- **The Gloam.** A violet smoke wall closes one ring at a time, down to the central 4×4, at the
  end of a Night or during the boss rounds. The ring that is about to close is marked from the
  start of that round, and the **Gloam Bell** counts down the rounds. A piece that ends a Tally in
  the Gloam takes 2 damage (Ward doesn't help); Plumes, Lanterns, Mortars and Smokestacks there
  are swallowed.
- **Falling.** Before the Boss Night your hero smolders and comes back at its start tile at the
  start of your next turn (half HP, Ready) — unless the Gloam covers the Wick first; a hero that
  falls *in* the Gloam is out at once. On the Boss Night (or with respawns off), a fallen hero is
  **eliminated**: its units melt and it keeps its Glory.
- **Haunting.** An eliminated player keeps playing: at every Plume placement they place a Sootling
  Plume on a legal tile, haunting the nearest hero (not the same hero twice in a row).
- **Bounty.** The sole Glory leader wears the "Wanted" seal: felling their hero is worth extra.
- **The end** comes at the first of: the round the boss falls, the last boss round, or a Tally
  with one hero (or none) left standing. Ties go to whoever was standing, then the later
  elimination, then boss damage dealt.

### Glory *(generated)*

<!-- generated:glory -->
| Event | Glory |
| --- | --- |
| Slay a Snuff | Minion +1, Soldier +2, Elite +3, Structure +2 |
| Fell a rival unit | +1 |
| Fell a rival hero | +3 |
| Bounty: fell the hero of the sole Glory leader | +3 more |
| Light a Votive Shrine | +1 |
| Damage the boss | +1 per full 10% of its max HP you dealt |
| Land the boss killing blow | +2 |
| Still standing at the end | +5 |
| Your hero falls (any cause) | −2 (never below 0) |
<!-- /generated:glory -->

## 9. Bosses *(generated)*

The boss is a 2×2 piece. It declares **every** intent of its current phase each Snuff Move, and its
intents resolve before all others. It cannot be pushed, pulled or swapped, the Gloam and the Snuff
can't hurt it, and there is never a Take against it. At ⅔ and ⅓ of its HP it enters a new phase.
Its HP grows with the number of players (times the difficulty's boss multiplier). When the boss
dies, every Snuff on the board dies with it.

<!-- generated:bosses -->
| Boss | HP | Special | Weakness | Phases: moves; intents |
| --- | --- | --- | --- | --- |
| **Hush Hierophant**<br>*The Bell That Swallows Song* | 25 + 10 per player | Silencing Peal limits each player to 1 card next turn. | Hollow bell: Strikes from pieces adjacent to it deal +1 damage. | 1: 1 orthogonal step; Bell Drop, Hushwave<br>2: King step; Bell Drop, Hushwave, Silencing Peal<br>3: King step; Bell Drop, Bell Drop, Hushwave, Silencing Peal |
| **The Guttered King**<br>*Monarch of Melted Wax* | 48 + 12 per player | Immune to Hot Wax, and spits more of it. | Box him in: block all 8 escape steps for CHECKMATE. | 1: King step; Ladle Slam, Sceptre Sweep<br>2: King step; Ladle Slam, Sceptre Sweep, Wax Spit<br>3: King step; Ladle Slam, Sceptre Sweep, Sceptre Sweep, Wax Spit |
| **Nocturna**<br>*Daughter of the Moth-Moon* | 10 + 11 per player | Flies over everything. Hunger eats the brightest light and heals her. | Light lures her: Hunger always bites the brightest light. Bait her with a Lantern or a Lit Shrine. | 1: Queen slide 2, flying; Wing Gust, Hunger<br>2: Queen slide 2, flying; Wing Gust, Hunger, Hunger<br>3: Queen slide 2, flying; Wing Gust, Hunger, Dust Storm |
<!-- /generated:bosses -->

<details>
<summary>Every boss intent</summary>

<!-- generated:boss_intents -->
| Intent | Boss | What it does |
| --- | --- | --- |
| **Bell Drop** | Hush Hierophant | A 2x2 bell crashes down within 5 of the footprint for 3, ignoring line of sight. |
| **Hushwave** | Hush Hierophant | A silent wave hits the 12 tiles around the bell for 1 and pushes them 1 outward. |
| **Silencing Peal** | Hush Hierophant | During the next players phase, each seat may play at most 1 card. |
| **Ladle Slam** | The Guttered King | The ladle slams the 2 tiles along one side for 3 and pushes them 1 away. |
| **Sceptre Sweep** | The Guttered King | A 2-wide beam of moonfire, 4 tiles long, hits every piece in it for 2. |
| **Wax Spit** | The Guttered King | Spits hot wax on a tile at distance 2-4 for 1, leaving a Hot Wax pool. |
| **Wing Gust** | Nocturna | A 2-wide gust, 3 tiles long, hits every piece in it for 1 and blows them 2 along it. |
| **Hunger** | Nocturna | Bites the brightest light within 6 for 3. If it puts out a light or fells a piece, she heals 2. |
| **Dust Storm** | Nocturna | A 3x3 storm of wing-dust centred within 4 hits for 1 and Dazes. |
<!-- /generated:boss_intents -->

</details>

**The Guttered King's CHECKMATE.** Count his *escapes*: how many of his 8 one-step moves are open.
Your pieces, his own Gutter Pawns, Pillars, Candles and the board edge all block (Hot Wax doesn't).
At 1–2 escapes the board shouts **CHECK!**; if he has **0 escapes at the end of your turns** he takes
15% of his max HP (Ward can't stop it) and a crown socket fills — up to three times per fight.

## 10. The board

### Tiles, overlays and tokens *(generated)*

<!-- generated:tiles -->
| Tile or token | Rule |
| --- | --- |
| **Flagstone** | Plain engraved stone. |
| **Pillar** | Cannot be entered. Blocks line of sight. Cannot be damaged. |
| **Rubble** | A non-flying slide that enters Rubble stops there. |
| **Votive Shrine** | A Wickfolk piece on or adjacent may spend its Strike to light it. A Lit Shrine heals 1 HP to each Wickfolk piece on or adjacent to it at Tally. A Snuff ending a move on it, or a Snuff attack covering it, puts it out. In Last Flame, lighting one gives +1 Glory. |
| **Chimney** | Comes in pairs. A voluntary Move by a Wickfolk piece that enters a Chimney ends on the paired Chimney, if that one is empty. No chaining. For everything else it is a flagstone. |
| **Hot Wax** | 1 damage to a non-flying, non-immune piece that ends any movement on it, and 1 more at each Tally while it stays. Sliding through does nothing. |
| **Gloam** | Last Flame only. A Wickfolk piece that ends a Tally in Gloam takes 2 damage; Ward does not apply. Snuff and bosses are immune. Removes Plumes, Lanterns, Wick Mortars and Smokestacks; darkens Lit Shrines; a Smoldering Wick here is eliminated. |
| **Gloam Warning** | Marks the ring that closes at this round's Tally. |
| **Vigil Candle** | Vigil structure. 3 HP, immobile, immune to displacement. Blocks movement and line of sight. Can receive Ward and healing. Each hit adds Dread; at 0 HP it is snuffed. |
| **Smoldering Wick** | Left by a fallen hero. Blocks movement but not line of sight. Can be damaged only by Gloam. An adjacent ally can relight it with its Strike. |
| **Smoke Plume** | An enemy rises from it after the Snuff Strike. Stand on it to block it (take 1 damage) or strike it to pop it. |
| **Lit Shrine** | A lit Votive Shrine: heals 1 HP to each Wickfolk piece on or adjacent to it at Tally. |
| **First Light** | The first-player token. In Vigil it chooses the Toll; in Last Flame its holder acts first each round. |
| **Crown Socket** | Fills gold on each CHECKMATE against the Guttered King (at most 3). |
| **Bounty Seal** | "Wanted": felling the hero of the sole Glory leader earns +3 Glory more. |
<!-- /generated:tiles -->

Smoldering Wicks block movement but not line of sight. Line of sight is blocked by pieces, Pillars
and boss footprints — not by Rubble, Plumes, Hot Wax, the Gloam, Shrines or Chimneys.

### Statuses *(generated)*

<!-- generated:statuses -->
| Status | Shown as | Rule |
| --- | --- | --- |
| **Ward** | hexagon | Cancels one whole damage instance (bump, Plume block and Hot Wax included), then breaks. Does not stop Gloam or Checkmate damage. |
| **Burn** | flame | 1 damage at Tally, for 2 Tallies. Does not stack; reapplying resets the count to 2. |
| **Dazed** | spiral | Wickfolk: its next Strike is lost. Snuff with an intent: the intent is cancelled. Snuff without one: it declares none next Snuff Move. Boss: its last intent is cancelled. |
<!-- /generated:statuses -->

### The Moth Die *(generated)*

Rolled at the start of every round (when the Moth Die is on). The top bar shows what the face
*does*, never just its name. Faces 1–2 hurt, 3–4 are neutral, 5–6 help.

<!-- generated:omens -->
| Face | Name | Top-bar label | This round |
| --- | --- | --- | --- |
| 1 | **Eclipse** | Snuff hit +1 | Every Snuff intent deals +1 damage this round. |
| 2 | **Smoke** | Extra Plume | A Sootling Plume appears now on a legal tile; it rises this round. With neutrals off, nothing happens. |
| 3 | **Stillness** | Calm | No effect. |
| 4 | **Long Shadows** | Slow Snuff | Snuff steps and slides move 1 tile less (minimum 1). Leaps are unchanged. |
| 5 | **Kindling** | +1 Flame | Every seat gets +1 Flame at the start of its seat turn. |
| 6 | **Bright Wings** | Draw +1 | Every seat draws 1 extra card at the start of its seat turn. |
<!-- /generated:omens -->

## 11. Between Nights

### Tolls *(generated)*

From Night 2, each regular Night opens with a **Toll**: one Blessing and one Curse are revealed and
one player chooses (Vigil: the First Light holder; Last Flame: the player with the least Glory).
Choosing the **Curse** pays off: at the next Chandlery everyone takes **two** cards instead of one.
There is no Toll on the Boss Night.

<!-- generated:tolls -->
| Toll | Kind | For the whole Night |
| --- | --- | --- |
| **Candlemas Blessing** | Blessing | Every hero and Vigil Candle starts the Night with Ward. |
| **Lucky Wick** | Blessing | Draw up to 6 cards instead of 5. |
| **Hearthwind** | Blessing | At every Tally, every Wickfolk piece heals 1 HP. |
| **Peddler of Wicks** | Blessing | +1 Flame at the start of every seat turn. |
| **Moth Migration** | Blessing | Each hero starts the Night with a free Velvet Moth (placed next to the hero; counts toward the unit limit). |
| **Soot Fog** | Curse | Every Wickfolk range (strikes, cards, Powers) is 1 shorter, minimum 1. |
| **Bell of Embers** | Curse | Snuff attacks also apply Burn. |
| **Waxen Rain** | Curse | At every Plume placement, 2 Hot Wax pools also appear on empty flagstones at least 2 from every hero. |
| **Ill Omen** | Curse | Moth Die faces 5 and 6 count as 3 (Stillness). |
| **Crumbling Nave** | Curse | At Night start, every Pillar crumbles into Rubble, and 4 more Rubble tiles appear on empty flagstones. |
| **Restless Soot** | Curse | Snuff steps and slides move 1 tile farther. |
| **Shifting Chimneys** | Curse | At every Tally, each Chimney pair moves to new empty flagstones at least 2 from every hero. |
| **Muffled Nave** | Curse | Each seat may play at most 2 cards per seat turn. |
| **Black Sun** | Curse | +1 Plume at every Plume placement. |
<!-- /generated:tolls -->

### Dawn and the Chandlery

At **Dawn** all Snuff and Plumes vanish, Smoldering heroes relight (Vigil), heroes and kept units
heal, and each player may **keep up to 2 units** for the next Night (the rest melt). Hands are
discarded and Charms go back to the discard pile.

At the **Chandlery** you see a Night summary, then **draft**: 3 cards from your class and the
neutral pool rise from the wax tray — take one (two after a Curse) or skip. Then choose one
**Boon**. In Vigil everyone drafts at once and the offers are public; in Last Flame they are private.

<!-- generated:chandlery -->
| Name | Kind | Effect |
| --- | --- | --- |
| **Heirloom** | Boon | Choose 1 of 2 random Heirlooms you don't own. |
| **Temper** | Boon | Temper one card: it costs 1 less (minimum 0). Quickwick, already free, gives 2 extra Moves instead. |
| **Prune** | Boon | Remove up to 2 cards from your deck. The deck cannot go below 8. |
| **Ever-Burning Wick** | Heirloom | Your hero starts every Night with Ward. |
| **Brass Thimble** | Heirloom | +2 max HP for your hero. |
| **Lamplighter's Hook** | Heirloom | +1 range on every card that counts from your hero. |
| **Moth-Velvet Cloak** | Heirloom | Your hero is flying. |
| **Candlemaker's Mold** | Heirloom | Your first Summon each seat turn costs 1 less Flame (minimum 0). |
| **Bell of Saint Tallow** | Heirloom | Once per Night, as a free action, Daze an enemy within 4 of your hero. |
<!-- /generated:chandlery -->

## 12. Difficulty *(generated)*

Pick a difficulty on the Setup screen (Quick Play uses Dusk; after a loss it offers Candlelit).
Every number can also be changed one by one in the **Advanced** panel.

<!-- generated:difficulty -->
| Difficulty | Chip | Dread start / max | Enemies / Plumes | +1 HP to | Boss HP | Heal at Dawn | Extra Smokestack | Retry |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Candlelit** | 1 candle · Gentle | 0 / 14 | −1 / −1 | — | ×0.80 | 6 | Off | On |
| **Dusk** | 2 candles · Normal | 0 / 12 | 0 / 0 | — | ×1.00 | 4 | Off | On |
| **Midnight** | 3 candles · Hard | 2 / 12 | 0 / 0 | Soldiers, Elites, structures | ×1.20 | 3 | On | Off |
| **Witching Hour** | 4 candles · Brutal | 3 / 12 | +1 / 0 | Every Snuff | ×1.30 | 2 | On | Off |
<!-- /generated:difficulty -->
