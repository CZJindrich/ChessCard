/** Dev gallery page: one section per art family, each with an anchor for screenshots. */
import type { ReactElement, ReactNode } from 'react';
import { BoardSection } from './BoardSection';
import { BossesSection } from './BossesSection';
import { CardsSection } from './CardsSection';
import { DieSection } from './DieSection';
import { IconsSection } from './IconsSection';
import { PiecesSection, SmallPiecesStrip } from './PiecesSection';
import { ScenesSection } from './ScenesSection';

interface SectionDef {
  id: string;
  title: string;
  render: () => ReactNode;
}

const SECTIONS: SectionDef[] = [
  { id: 'pieces', title: 'Pieces (64 px)', render: () => <PiecesSection size={64} /> },
  {
    id: 'pieces-small',
    title: 'Pieces at board sizes (40 / 48 px)',
    render: () => (
      <>
        <h3>40 px</h3>
        <SmallPiecesStrip size={40} />
        <h3>48 px</h3>
        <SmallPiecesStrip size={48} />
      </>
    ),
  },
  { id: 'bosses', title: 'Bosses', render: () => <BossesSection /> },
  { id: 'board', title: 'Board, tiles & marks', render: () => <BoardSection /> },
  { id: 'icons', title: 'Icons & glyphs', render: () => <IconsSection /> },
  { id: 'cards', title: 'Cards', render: () => <CardsSection /> },
  { id: 'die', title: 'Moth Die', render: () => <DieSection /> },
  { id: 'scenes', title: 'Scenes', render: () => <ScenesSection /> },
  { id: 'pieces-zoom', title: 'Pieces 2× (128 px)', render: () => <PiecesSection size={128} /> },
];

export function Gallery(): ReactElement {
  return (
    <main className="gal">
      <h1>Wickwatch Art Gallery</h1>
      <nav className="gal-nav">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.title}
          </a>
        ))}
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id}>
          <h2>{s.title}</h2>
          {s.render()}
        </section>
      ))}
    </main>
  );
}
