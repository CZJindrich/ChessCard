/**
 * The 8 rules of GDD §2.1, each with a small animated diagram built from the art library.
 */
import type { ReactElement } from 'react';
import { CardMini, FlameIcon, HourCandle, IntentTile, PALETTE, SmokePlumeToken } from '../../../art';
import type { ContentRegistry } from '../../../engine/types';
import { cardArtData } from '../../model/describe';
import { Anim, appearFrames, MiniBoard, MiniPiece, shift, squareAt, tourFrames, vanishFrames, type Stop } from './MiniBoard';

// ---------------------------------------------------------------------------------------------
// 1 · Survive the Night
// ---------------------------------------------------------------------------------------------

const LUNGE_AT_CANDLE = tourFrames([
  { at: [0, 0], rest: 0.5 },
  { at: [-0.4, -0.4], travel: 0.06, rest: 0.06 },
  { at: [0, 0], travel: 0.1, rest: 0.2 },
]);
const CANDLE_HIT = appearFrames(0.5, 0.6, 0.02);

function SurviveDiagram(): ReactElement {
  const candle = squareAt(1, 0, 3);
  return (
    <div className="ww-rule-diagram ww-rule-diagram--split">
      <MiniBoard cols={4} rows={3} label="A Sootling strikes a Vigil Candle">
        <IntentTile x={candle.x} y={candle.y} damage={1} queue={1} animated={false} />
        <MiniPiece defId="vigil_candle" kind="candle" at={[1, 0]} rows={3} hp={3} />
        <Anim frames={CANDLE_HIT} still={{ opacity: 0 }}>
          <circle cx={candle.x + 32} cy={candle.y + 30} r={30} fill={PALETTE.bloodWax} opacity={0.35} />
        </Anim>
        <Anim frames={LUNGE_AT_CANDLE}>
          <MiniPiece defId="sootling" side="snuff" kind="enemy" at={[2, 1]} rows={3} />
        </Anim>
      </MiniBoard>
      <div className="ww-rule-diagram__aside">
        <HourCandle value={5} max={12} size={44} />
        <span className="ww-rule-diagram__caption">Dread</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// 2 · Three beats
// ---------------------------------------------------------------------------------------------

function BeatsDiagram(): ReactElement {
  return (
    <div className="ww-rule-diagram ww-beats" role="img" aria-label="Snuff Move, then your turns, then Snuff Strike">
      <div className="ww-beats__row">
        <span className="ww-beat ww-beat--1">Snuff Move</span>
        <span className="ww-beats__arrow" aria-hidden="true">
          ›
        </span>
        <span className="ww-beat ww-beat--2 ww-beat--you">Your turns</span>
        <span className="ww-beats__arrow" aria-hidden="true">
          ›
        </span>
        <span className="ww-beat ww-beat--3">Snuff Strike</span>
      </div>
      <span className="ww-beats__after">Then Plumes rise and the round is tallied.</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// 3 · Move once, Strike once
// ---------------------------------------------------------------------------------------------

const MOVE_THEN_STRIKE: readonly Stop[] = [
  { at: [0, 0], rest: 0.2 },
  { at: [1, 0], travel: 0.1, rest: 0.25 },
  { at: [2, 1], travel: 0.06, rest: 0.3 },
];
const MOVE_THEN_STRIKE_FRAMES = tourFrames(MOVE_THEN_STRIKE);
const MOVE_THEN_STRIKE_FOE = vanishFrames(0.58, 0.94);

function MoveStrikeDiagram(): ReactElement {
  return (
    <MiniBoard cols={4} rows={3} label="Brannoc moves one square, then strikes and takes the Sootling's square">
      <Anim frames={MOVE_THEN_STRIKE_FOE}>
        <MiniPiece defId="sootling" side="snuff" kind="enemy" at={[2, 1]} rows={3} />
      </Anim>
      <Anim frames={MOVE_THEN_STRIKE_FRAMES}>
        <MiniPiece defId="sconce_paladin" kind="hero" at={[0, 0]} rows={3} showPips />
      </Anim>
    </MiniBoard>
  );
}

// ---------------------------------------------------------------------------------------------
// 4 · Melee takes the square; ranged stays put
// ---------------------------------------------------------------------------------------------

const MELEE_TAKE = tourFrames([
  { at: [0, 0], rest: 0.25 },
  { at: [1, 1], travel: 0.07, rest: 0.55 },
]);
const MELEE_FOE = vanishFrames(0.27, 0.93);
const BOLT: Keyframe[] = [
  { offset: 0, transform: shift(0, 0), opacity: 0 },
  { offset: 0.5, transform: shift(0, 0), opacity: 0 },
  { offset: 0.52, transform: shift(0, 0.3), opacity: 1 },
  { offset: 0.6, transform: shift(0, 1.7), opacity: 1 },
  { offset: 0.62, transform: shift(0, 1.7), opacity: 0 },
  { offset: 1, transform: shift(0, 0), opacity: 0 },
];
const RANGED_FOE = vanishFrames(0.61, 0.93);

function TakeDiagram(): ReactElement {
  const lantern = squareAt(4, 0, 3);
  return (
    <MiniBoard cols={5} rows={3} label="A melee kill takes the square; a ranged kill stays put">
      <Anim frames={MELEE_FOE}>
        <MiniPiece defId="sootling" side="snuff" kind="enemy" at={[1, 1]} rows={3} />
      </Anim>
      <Anim frames={MELEE_TAKE}>
        <MiniPiece defId="ember_duelist" kind="hero" at={[0, 0]} rows={3} />
      </Anim>
      <Anim frames={RANGED_FOE}>
        <MiniPiece defId="gnawmoth" side="snuff" kind="enemy" at={[4, 2]} rows={3} />
      </Anim>
      <MiniPiece defId="lantern" at={[4, 0]} rows={3} />
      <Anim frames={BOLT} still={{ opacity: 0 }}>
        <path d={`M${lantern.x + 32},${lantern.y + 4}l-5,14h10Z`} fill={PALETTE.flameCore} stroke={PALETTE.ember} strokeWidth={2} />
      </Anim>
      <line x1={2.5 * 64} y1={8} x2={2.5 * 64} y2={3 * 64 - 8} stroke={PALETTE.brass} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="4 8" />
    </MiniBoard>
  );
}

// ---------------------------------------------------------------------------------------------
// 5 · Cards cost Flame
// ---------------------------------------------------------------------------------------------

function FlameDiagram({ content }: { content: ContentRegistry }): ReactElement {
  const spark = content.cards.byId.spark ?? content.cards.list[0];
  return (
    <div className="ww-rule-diagram ww-flame-diagram">
      {spark && (
        <div className="ww-flame-diagram__card">
          <CardMini card={cardArtData(spark)} width={64} animated={false} />
        </div>
      )}
      <div className="ww-flame-diagram__sconce" aria-label="3 Flame, one spent on the card">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`ww-flame-slot ww-flame-slot--${i}`}>
            <span className="ww-flame-slot__lit">
              <FlameIcon size={26} animated={false} />
            </span>
            <span className="ww-flame-slot__spent">
              <FlameIcon size={26} lit={false} animated={false} />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// 6 · Red tiles are promises
// ---------------------------------------------------------------------------------------------

const ANSWER_THE_RED = tourFrames([
  { at: [0, 0], rest: 0.45 },
  { at: [-1, 1], travel: 0.07, rest: 0.4 },
]);
const THREAT_GONE = vanishFrames(0.5, 0.93);

function PromiseDiagram(): ReactElement {
  const target = squareAt(0, 1, 3);
  return (
    <MiniBoard cols={4} rows={3} label="Kill the attacker and its red tile goes with it">
      <MiniPiece defId="vigil_candle" kind="candle" at={[0, 1]} rows={3} hp={3} />
      <Anim frames={THREAT_GONE}>
        <IntentTile x={target.x} y={target.y} damage={1} queue={1} animated={false} />
        <MiniPiece defId="sootling" side="snuff" kind="enemy" at={[1, 1]} rows={3} />
      </Anim>
      <Anim frames={ANSWER_THE_RED}>
        <MiniPiece defId="sconce_paladin" kind="hero" at={[2, 0]} rows={3} />
      </Anim>
    </MiniBoard>
  );
}

// ---------------------------------------------------------------------------------------------
// 7 · Violet spirals are Smoke Plumes
// ---------------------------------------------------------------------------------------------

const BLOCK_THE_PLUME = tourFrames([
  { at: [0, 0], rest: 0.35 },
  { at: [0, 1], travel: 0.1, rest: 0.45 },
]);
const PLUME_GONE = vanishFrames(0.5, 0.93, 0.08);

function PlumeDiagram(): ReactElement {
  const plume = squareAt(1, 1, 3);
  return (
    <MiniBoard cols={3} rows={3} label="A Taper stands on a Smoke Plume to block it">
      <Anim frames={PLUME_GONE}>
        <SmokePlumeToken x={plume.x} y={plume.y} enemyId="sootling" seed="howto-plume" />
      </Anim>
      <Anim frames={BLOCK_THE_PLUME}>
        <MiniPiece defId="taper" at={[1, 0]} rows={3} />
      </Anim>
    </MiniBoard>
  );
}

// ---------------------------------------------------------------------------------------------
// 8 · Fallen heroes smolder
// ---------------------------------------------------------------------------------------------

const RELIGHT_LUNGE = tourFrames([
  { at: [0, 0], rest: 0.35 },
  { at: [-0.3, 0], travel: 0.05, rest: 0.05 },
  { at: [0, 0], travel: 0.08, rest: 0.4 },
]);
const WICK = vanishFrames(0.42, 0.92, 0.06);
const RELIT = appearFrames(0.42, 0.92, 0.06);
const RELIGHT_FLASH = appearFrames(0.4, 0.5, 0.03);

function SmolderDiagram(): ReactElement {
  const wick = squareAt(0, 0, 2);
  return (
    <MiniBoard cols={3} rows={2} label="An adjacent ally relights a Smoldering Wick">
      <Anim frames={WICK}>
        <MiniPiece defId="smoldering_wick" kind="wick" at={[0, 0]} rows={2} />
      </Anim>
      <Anim frames={RELIT} still={{ opacity: 0 }}>
        <MiniPiece defId="sconce_paladin" kind="hero" at={[0, 0]} rows={2} />
      </Anim>
      <Anim frames={RELIGHT_FLASH} still={{ opacity: 0 }}>
        <circle cx={wick.x + 32} cy={wick.y + 32} r={30} fill="none" stroke={PALETTE.candleGold} strokeWidth={4} />
      </Anim>
      <Anim frames={RELIGHT_LUNGE}>
        <MiniPiece defId="taper_captain" at={[1, 0]} rows={2} />
      </Anim>
    </MiniBoard>
  );
}

// ---------------------------------------------------------------------------------------------

export interface RuleCard {
  title: string;
  text: string;
  Diagram: (props: { content: ContentRegistry }) => ReactElement;
}

export const RULES: readonly RuleCard[] = [
  {
    title: 'Survive the Night.',
    text: 'In Vigil, keep the Vigil Candles lit. Each Candle hit adds Dread, and when Dread is full the Long Night falls. The last Night is the Boss Night: slay the boss to win. In Last Flame, earn the most Glory before the last Night ends.',
    Diagram: SurviveDiagram,
  },
  {
    title: 'Every round has three beats.',
    text: 'Snuff Move (enemies move and paint red danger tiles) → your turns → Snuff Strike (the red tiles are hit). Then Plumes rise and the round is tallied.',
    Diagram: BeatsDiagram,
  },
  {
    title: 'Each piece may Move once and Strike once, in either order.',
    text: "Pieces move like chess pieces. The rune on a piece's base shows how.",
    Diagram: MoveStrikeDiagram,
  },
  {
    title: 'Melee pieces strike where they could move, and a melee kill takes the square.',
    text: 'Ranged pieces shoot along lines and stay put. Pawns are the exception: they move straight and strike diagonally.',
    Diagram: TakeDiagram,
  },
  {
    title: 'Cards cost Flame.',
    text: 'Each turn you get 3 Flame and draw up to 5 cards. Summons bring new pieces, which act from your next turn. Rites happen at once. Charms attach to a piece.',
    Diagram: FlameDiagram,
  },
  {
    title: 'Red tiles are promises.',
    text: 'Every enemy attack is locked in before you act. Kill the attacker, push it, pull it, or step out of the red. An attack aimed by an enemy moves with that enemy.',
    Diagram: PromiseDiagram,
  },
  {
    title: 'Violet spirals are Smoke Plumes.',
    text: 'An enemy rises from each one after the Snuff Strike. Stand on it to block it (you take 1 damage), or strike it to pop it.',
    Diagram: PlumeDiagram,
  },
  {
    title: 'Fallen heroes smolder.',
    text: 'A hero at 0 HP becomes a Smoldering Wick. An adjacent ally can relight it by using its Strike.',
    Diagram: SmolderDiagram,
  },
];

/** Glossary (GDD §2.2). */
export const GLOSSARY: ReadonlyArray<readonly [string, string]> = [
  ['Round', 'One full loop: Moth Die, Snuff Move, players, Snuff Strike, Rise, Tally. The UI shows "Round t/T".'],
  ['Seat turn', "One seat's activation inside the players phase."],
  ['Night', 'A set number of rounds (4 by default). The Boss Night is the last Night.'],
  ['Ready / Spent', 'A piece with an unused Move or Strike is Ready. A piece that has used both is Spent.'],
  ['Exhausted', "A piece that arrived this round. It has no actions until its owner's next seat turn."],
  ['Take', "After a melee kill, the striker moves onto the victim's tile. This is automatic and does not use the Move."],
  ['Intent', 'A locked enemy attack, drawn as red tiles.'],
  ['Flame', 'Card currency. It refills at the start of each of your seat turns.'],
  ['Dread', 'Vigil loss track, shown on the Hour Candle.'],
  ['Glory', 'Last Flame score.'],
  ['Gloam', 'The closing smoke ring in Last Flame.'],
  ['Toll', "The Night's event card."],
  ['Moth Die', 'The six-sided die rolled at the start of every round.'],
  ['First Light', 'The first-player token.'],
  ['Wickfolk / Snuff', 'The candle side / the smoke side.'],
  ['Adjacent', 'One of the 8 neighbouring tiles, unless the text says orthogonally adjacent.'],
  ['Within N', 'Chebyshev distance ≤ N: the larger of the file and rank differences.'],
];
