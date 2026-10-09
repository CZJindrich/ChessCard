/** Gallery: card faces of every type and rarity, tempered/disabled/mini, backs and sigils. */
import type { ReactElement, ReactNode } from 'react';
import { CardBack, CardFace, CardMini } from '../cards/CardFace';
import { SigilIcon } from '../cards/SigilArt';
import { SIGIL_GLYPH_IDS } from '../cards/sigils';
import { DISABLED_CARD, MODDED_CARD, SAMPLE_CARDS, TEMPERED_CARD } from './sampleCards';

function Item({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="gal-item">
      {children}
      <div className="gal-label">{label}</div>
    </div>
  );
}

export function CardsSection(): ReactElement {
  return (
    <section className="gal-section">
      <h3>Card faces (240 px)</h3>
      <div className="gal-row" id="cards-faces">
        {SAMPLE_CARDS.slice(0, 6).map((c) => (
          <Item key={c.id} label={`${c.type} · ${c.rarity}`}>
            <CardFace card={c} width={240} />
          </Item>
        ))}
      </div>
      <div className="gal-row" id="cards-faces-2" style={{ marginTop: 16 }}>
        {SAMPLE_CARDS.slice(6).map((c) => (
          <Item key={c.id} label={`${c.type} · ${c.rarity}`}>
            <CardFace card={c} width={240} />
          </Item>
        ))}
      </div>
      <h3>Tempered · disabled · modded · back</h3>
      <div className="gal-row" id="cards-states">
        <Item label="tempered (cost −1, +, brass rim)">
          <CardFace card={TEMPERED_CARD} width={240} />
        </Item>
        <Item label="disabled with reason">
          <CardFace card={DISABLED_CARD} width={240} />
        </Item>
        <Item label="unknown type / rarity / sigils">
          <CardFace card={MODDED_CARD} width={240} />
        </Item>
        <Item label="card back">
          <CardBack width={240} />
        </Item>
      </div>
      <h3>Mini cards (hand fan, 120 px and 90 px)</h3>
      <div className="gal-row" id="cards-mini">
        {[...SAMPLE_CARDS.slice(0, 8), TEMPERED_CARD, DISABLED_CARD].map((c) => (
          <CardMini key={c.id} card={c} width={120} />
        ))}
      </div>
      <div className="gal-row" style={{ marginTop: 8 }}>
        {SAMPLE_CARDS.slice(0, 8).map((c) => (
          <CardMini key={c.id} card={c} width={90} />
        ))}
        <CardBack width={90} />
      </div>
      <h3>Sigil glyph library ({SIGIL_GLYPH_IDS.length} glyphs + fallback)</h3>
      <div className="gal-row" id="cards-sigils">
        {[...SIGIL_GLYPH_IDS, 'not_a_glyph'].map((id, i) => (
          <Item key={id} label={id}>
            <SigilIcon sigil={[id]} size={72} accent={['#F4B942', '#E8742C', '#3FA28C', '#9FD8E8', '#F09AD0', '#5FE0C8'][i % 6]} />
          </Item>
        ))}
      </div>
    </section>
  );
}
