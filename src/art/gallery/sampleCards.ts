/** Sample card data for the gallery (text from GDD §7.3; sigils mirror the content draft). */
import type { CardArtData } from '../cards/CardFace';

export const SAMPLE_CARDS: CardArtData[] = [
  { id: 'spark', name: 'Spark', type: 'rite', cost: 1, rarity: 'common', text: 'Deal 1 damage to an enemy or Smoke Plume within 3.', flavor: 'Small light, sharp bite.', art: { sigil: ['spark', 'flame'], accent: '#E8742C' } },
  { id: 'light_a_taper', name: 'Light a Taper', type: 'summon', cost: 1, rarity: 'common', text: 'Summon a Taper.', flavor: 'Every vigil begins with one.', summonUnitId: 'taper', art: { sigil: ['pawn', 'wick'], accent: '#F4B942' } },
  { id: 'beeswax_seal', name: 'Beeswax Seal', type: 'charm', cost: 1, rarity: 'common', text: 'Attach to an allied piece within 3: +1 max HP and +1 HP. It gains Ward.', art: { sigil: ['seal', 'shield'], accent: '#E09A2D' } },
  { id: 'shield_bash', name: 'Shield Bash', type: 'rite', cost: 1, rarity: 'common', text: 'Deal 2 damage to an enemy adjacent to your hero and push it 2 tiles away from your hero.', art: { sigil: ['shield', 'burst'], accent: '#F4B942' } },
  { id: 'turnabout', name: 'Turnabout', type: 'rite', cost: 1, rarity: 'rare', text: 'Reverse the locked intent of an enemy within 4.', flavor: 'The smoke forgets which way it was going.', art: { sigil: ['swap', 'arrow'], accent: '#B8913A' } },
  { id: 'rally_the_captain', name: 'Rally the Captain', type: 'summon', cost: 2, rarity: 'rare', text: 'Summon a Taper Captain.', summonUnitId: 'taper_captain', art: { sigil: ['crown'] } },
  { id: 'lens_of_brass', name: 'Lens of Brass', type: 'charm', cost: 2, rarity: 'rare', text: 'Attach to one of your Lanterns or Wick Mortars (any distance): +1 ATK and +2 range.', art: { sigil: ['lens', 'eye'], accent: '#B8913A' } },
  { id: 'dawnbreak', name: 'Dawnbreak', type: 'rite', cost: 4, rarity: 'mythic', text: 'Pop every Smoke Plume on the board. Heal 1 HP to every allied piece and Vigil Candle.', flavor: 'And the Long Night blinked first.', art: { sigil: ['sunrise', 'sun'], accent: '#FFD86B' } },
  { id: 'swarm_of_wings', name: 'Swarm of Wings', type: 'rite', cost: 4, rarity: 'mythic', text: 'Summon up to 2 Velvet Moths. All your Velvet Moths are Ready this turn, including the new ones.', art: { sigil: ['moth', 'wing', 'star'], accent: '#D9E2F2' } },
  { id: 'grand_illumination', name: 'Grand Illumination', type: 'rite', cost: 4, rarity: 'mythic', text: 'Each of your Lanterns deals 2 damage to every enemy in its 4 orthogonal lines, up to 4 tiles, passing through pieces (Pillars still block), and pops Plumes on those lines.', art: { sigil: ['lantern', 'sun', 'star'], accent: '#D9E2F2' } },
  { id: 'stoke_the_golem', name: 'Stoke the Golem', type: 'summon', cost: 4, rarity: 'rare', text: 'Summon a Bellows Golem.', summonUnitId: 'bellows_golem', art: { sigil: ['bellows', 'gear'], accent: '#B8913A' } },
  { id: 'riposte', name: 'Riposte', type: 'charm', cost: 1, rarity: 'rare', text: 'Attach to your hero: whenever a Snuff attack or a rival strike damages your hero, deal 1 damage to the attacker.', art: { sigil: ['blade', 'ring'], accent: '#3FA28C' } },
];

export const TEMPERED_CARD: CardArtData = { ...SAMPLE_CARDS[0], id: 'spark_t', cost: 0, tempered: true };
export const DISABLED_CARD: CardArtData = { ...SAMPLE_CARDS[7], id: 'dawn_d', disabled: true, reason: 'Need 4 Flame' };
export const MODDED_CARD: CardArtData = { id: 'mod_card', name: 'Strange Brew', type: 'ritual', cost: 7, rarity: 'legendary', text: 'A modded card with unknown type, rarity and sigil names.', art: { sigil: ['cauldron', 'newt'] } };
