/** Gallery: every piece in every House colour (and Snuff), with stats and statuses. */
import type { ReactElement } from 'react';
import { HOUSE_ORDER, HOUSES } from '../palette';
import { PieceArt, type PieceArtProps } from '../pieces/PieceArt';
import { ENEMY_IDS, getPieceSpec, HERO_IDS, STRUCTURE_IDS, UNIT_IDS } from '../pieces/registry';

const HERO_STATS: Record<string, [number, number]> = {
  sconce_paladin: [8, 2],
  moth_witch: [6, 2],
  lampwright: [6, 2],
  ember_duelist: [6, 2],
};
const UNIT_STATS: Record<string, [number, number]> = {
  taper: [1, 1],
  taper_captain: [2, 2],
  wickhorse: [2, 2],
  incense_acolyte: [2, 1],
  sconce_squire: [3, 1],
  brass_ram: [4, 2],
  velvet_moth: [1, 1],
  silkspinner: [2, 1],
  lantern: [2, 1],
  wick_mortar: [2, 2],
  bellows_golem: [5, 2],
  cinderling: [1, 1],
  twinwick: [2, 1],
};
const ENEMY_STATS: Record<string, [number, number]> = {
  sootling: [1, 1],
  gnawmoth: [1, 1],
  smokehound: [2, 1],
  ink_wretch: [2, 1],
  hush_monk: [3, 1],
  ash_deacon: [2, 1],
  knell_banshee: [4, 2],
  gutter_pawn: [2, 1],
  drip_hulk: [6, 2],
  snuffer_knight: [4, 2],
  hollow_lamplighter: [5, 2],
  smokestack: [4, 0],
  clapper: [5, 2],
};

/** Four state variants shown across the House columns, so every status gets exercised. */
const WICK_VARIANTS: Array<Partial<PieceArtProps>> = [
  { ready: true },
  { ward: true, movesLeft: 0, strikesLeft: 1 },
  { burn: 2, charm: 'beeswax_seal', lookAt: { dx: 1, dy: 0 } },
  { spent: true, dazed: true },
];
const SNUFF_VARIANTS: Array<Partial<PieceArtProps>> = [{}, { ward: true }, { burn: 2 }, { dazed: true }, { lookAt: { dx: -1, dy: 1 } }];

function Cell({ i, children, size }: { i: number; children: ReactElement; size: number }): ReactElement {
  return (
    <div className={`gal-cell ${i % 2 === 0 ? 'a' : 'b'}`} style={{ width: size + 24, height: size + 24 }}>
      {children}
    </div>
  );
}

function WickRow({ id, size, stats }: { id: string; size: number; stats: [number, number] }): ReactElement {
  const spec = getPieceSpec(id);
  return (
    <>
      <div className="gal-rowhead">{spec.name}</div>
      {HOUSE_ORDER.map((house, i) => (
        <Cell key={house} i={i} size={size}>
          <PieceArt defId={id} houseColor={HOUSES[house].color} hp={i === 1 ? Math.max(1, stats[0] - 1) : stats[0]} maxHp={stats[0]} atk={stats[1]} size={size} seed={`${id}${i}`} {...WICK_VARIANTS[i]} />
        </Cell>
      ))}
      <Cell i={4} size={size}>
        <PieceArt defId={id} side="snuff" hp={stats[0]} atk={stats[1]} size={size} seed={`${id}s`} />
      </Cell>
    </>
  );
}

function SnuffRow({ id, size }: { id: string; size: number }): ReactElement {
  const spec = getPieceSpec(id, 'snuff');
  const [hp, atk] = ENEMY_STATS[id] ?? [2, 1];
  return (
    <>
      <div className="gal-rowhead">{spec.name}</div>
      {SNUFF_VARIANTS.map((v, i) => (
        <Cell key={i} i={i} size={size}>
          <PieceArt defId={id} hp={i === 2 ? Math.max(1, hp - 1) : hp} maxHp={hp} atk={atk} size={size} seed={`${id}${i}`} {...v} />
        </Cell>
      ))}
    </>
  );
}

function Grid({ children, size }: { children: ReactElement[]; size: number }): ReactElement {
  return (
    <div className="gal-grid" style={{ gridTemplateColumns: `auto repeat(5, ${size + 24}px)` }}>
      {children}
    </div>
  );
}

export function PiecesSection({ size = 64 }: { size?: number }): ReactElement {
  return (
    <section className="gal-section">
      <h3>Heroes — Beeswax · Tallow · Bayberry · Rushlight · (as Snuff)</h3>
      <Grid size={size}>
        {HERO_IDS.map((id) => (
          <WickRow key={id} id={id} size={size} stats={HERO_STATS[id]} />
        ))}
      </Grid>
      <h3>Units</h3>
      <Grid size={size}>
        {UNIT_IDS.map((id) => (
          <WickRow key={id} id={id} size={size} stats={UNIT_STATS[id]} />
        ))}
      </Grid>
      <h3>Snuff — plain · ward · burn · dazed · glancing</h3>
      <Grid size={size}>
        {ENEMY_IDS.map((id) => (
          <SnuffRow key={id} id={id} size={size} />
        ))}
      </Grid>
      <h3>Structures &amp; fallbacks</h3>
      <div className="gal-row">
        {STRUCTURE_IDS.map((id, i) => (
          <Cell key={id} i={i} size={size}>
            <PieceArt defId={id} hp={3} maxHp={3} size={size} />
          </Cell>
        ))}
        <Cell i={0} size={size}>
          <PieceArt defId="vigil_candle" hp={1} maxHp={3} ward size={size} />
        </Cell>
        <Cell i={1} size={size}>
          <PieceArt defId="sconce_paladin" kind="wick" houseColor={HOUSES.house_rushlight.color} size={size} />
        </Cell>
        <Cell i={0} size={size}>
          <PieceArt defId="modded_unit" kind="unit" rune="rune_star" hp={3} atk={1} size={size} />
        </Cell>
        <Cell i={1} size={size}>
          <PieceArt defId="modded_enemy" kind="enemy" hp={2} atk={2} size={size} />
        </Cell>
        <Cell i={0} size={size}>
          <PieceArt defId="taper" exhausted hp={1} atk={1} size={size} />
        </Cell>
        <Cell i={1} size={size}>
          <PieceArt defId="taper" mood="happy" hp={1} atk={1} movesLeft={2} strikesLeft={1} size={size} />
        </Cell>
      </div>
    </section>
  );
}

/** Small-size readability strip: every piece at board sizes (40 / 48 px). */
export function SmallPiecesStrip({ size }: { size: number }): ReactElement {
  const ids = [...HERO_IDS, ...UNIT_IDS, ...ENEMY_IDS, ...STRUCTURE_IDS];
  return (
    <div className="gal-row" style={{ gap: 0 }}>
      {ids.map((id, i) => {
        const snuff = getPieceSpec(id).faction === 'snuff';
        const stats = HERO_STATS[id] ?? UNIT_STATS[id] ?? ENEMY_STATS[id] ?? [3, 0];
        return (
          <div key={id} className={`gal-cell ${i % 2 === 0 ? 'a' : 'b'}`} style={{ width: size, height: size }}>
            <PieceArt
              defId={id}
              size={size}
              houseColor={HOUSES[HOUSE_ORDER[i % 4]].color}
              hp={stats[0]}
              atk={id === 'vigil_candle' || id === 'smoldering_wick' ? undefined : stats[1]}
              seed={`${id}sm`}
              side={snuff ? 'snuff' : 'wick'}
            />
          </div>
        );
      })}
    </div>
  );
}
