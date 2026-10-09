import { describe, expect, it } from 'vitest';
import { loadBaseContent } from '../../../src/engine/content';
import { fillTables, markdownTable, playerText, rulesTables } from '../../../scripts/rules-tables';

describe('docs/RULES.md table generator', () => {
  const content = loadBaseContent();
  const tables = rulesTables(content);

  it('writes Markdown tables and escapes pipes in cells', () => {
    expect(markdownTable(['A', 'B'], [['x|y', 2]])).toBe('| A | B |\n| --- | --- |\n| x\\|y | 2 |');
  });

  it('drops the engine notes from content texts', () => {
    expect(playerText('Cannot be pushed or pulled. (Expressed as immune: push, pull.)')).toBe('Cannot be pushed or pulled.');
    expect(playerText('Cannot be swapped. (immune: displacement; attack.push 1.)')).toBe('Cannot be swapped.');
    expect(playerText('Velvet Moth (placed next to the hero).')).toBe('Velvet Moth (placed next to the hero).');
  });

  it('lists every hero, boss, enemy, Toll and Moth Die face from the content', () => {
    for (const hero of content.heroes.list) expect(tables.heroes).toContain(`**${hero.name}**`);
    for (const boss of content.bosses.list) {
      expect(tables.bosses).toContain(boss.weaknessText);
      expect(tables.bosses).toContain(`Vigil: ${boss.hp.base + boss.hp.perPlayer} per player`);
      expect(tables.bosses).toContain(`Last Flame: ${boss.hp.base} + ${boss.hp.perPlayer} per hero`);
      if (boss.coopIntent) expect(tables.bosses).toContain(`Co-op: +1 ${content.bossIntents.byId[boss.coopIntent]?.name} per extra player`);
    }
    for (const enemy of content.enemies.list) expect(tables.enemies).toContain(`**${enemy.name}**`);
    for (const toll of content.tolls.list) expect(tables.tolls).toContain(toll.text);
    expect(tables.omens.split('\n')).toHaveLength(2 + content.omens.list.length);
  });

  it('fills only the marked blocks and leaves the prose alone', () => {
    const doc = 'Intro\n<!-- generated:a -->\nold\n<!-- /generated:a -->\nOutro\n<!-- generated:b --><!-- /generated:b -->\n';
    expect(fillTables(doc, { a: 'A', b: 'B' })).toBe('Intro\n<!-- generated:a -->\nA\n<!-- /generated:a -->\nOutro\n<!-- generated:b -->\nB\n<!-- /generated:b -->\n');
  });

  it('refuses a marker without a table, and a table without a marker', () => {
    expect(() => fillTables('<!-- generated:x --><!-- /generated:x -->', {})).toThrow(/no table/);
    expect(() => fillTables('no markers', { a: 'A' })).toThrow(/missing generated blocks: a/);
  });
});
