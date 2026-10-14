import { describe, expect, it } from 'vitest';
import index from 'virtual:react-icons-index';
import chunks from 'virtual:react-icons-chunks';
import {
  chunkIndex, countIcons, getIconFamily, iconTreeSvg, ICON_FAMILIES, iconLabel, parseReactIcon, reactIconValue, searchIconIndex,
} from '../../src/lib/reactIcons';
import { iconEmoji } from '../../shared/calendar.js';

describe('react-icons', () => {
  it('lists every family of the package with its icon names', () => {
    expect(Object.keys(index).sort()).toEqual(ICON_FAMILIES.map((f) => f.id).sort());
    const sections = searchIconIndex(index, '');
    expect(sections.map((s) => s.family.id)).toEqual(ICON_FAMILIES.map((f) => f.id));
    expect(countIcons(sections)).toBeGreaterThan(40000);
    const tabler = sections.find((s) => s.family.id === 'tb')!;
    expect(tabler.names).toContain('TbFlame');
    expect(tabler.names.every((n) => n.startsWith('Tb'))).toBe(true);
  });

  it('splits each family in small chunks of sorted names', async () => {
    const tabler = chunks.tb;
    expect(tabler.length).toBeGreaterThan(30);
    const firsts = tabler.map((c) => c[0]);
    expect([...firsts].sort()).toEqual(firsts);
    const i = chunkIndex(firsts, 'TbFlame');
    const chunk = (await tabler[i][1]()).default;
    expect(Object.keys(chunk).length).toBeLessThanOrEqual(128);
    expect(chunk.TbFlame).toMatchObject({ tag: 'svg', child: expect.any(Array) });
    expect(chunkIndex(firsts, firsts[0])).toBe(0);
    expect(chunkIndex(firsts, 'Tbzzz')).toBe(firsts.length - 1);
  });

  it('turns an icon into a standalone SVG drawn like react-icons does', async () => {
    const lucide = chunks.lu;
    const tree = (await lucide[chunkIndex(lucide.map((c) => c[0]), 'LuFlame')][1]()).default.LuFlame;
    const svg = iconTreeSvg(tree, 72, '#ffffff');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" color="#ffffff" /);
    // Lucide sets its own stroke: it overrides react-icons' defaults, in SVG attribute names.
    expect(svg).toContain('stroke-width="2"');
    expect(svg).not.toContain('strokeWidth');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('width="72" height="72"');
    expect(svg).toMatch(/<path d="[^"]+"><\/path>/);
  });

  it('stores icons as "ri:<family>:<Name>"', () => {
    expect(reactIconValue('fa6', 'FaFlag')).toBe('ri:fa6:FaFlag');
    expect(parseReactIcon('ri:fa6:FaFlag')).toEqual({ family: 'fa6', name: 'FaFlag' });
    expect(parseReactIcon('ri:nope:FaFlag')).toBeNull();
    expect(parseReactIcon('ri:tb:../x')).toBeNull();
    expect(parseReactIcon('lucide:Star')).toBeNull();
    expect(parseReactIcon('🔥')).toBeNull();
  });

  it('searches names without the family prefix, in one family or all', () => {
    const flame = searchIconIndex(index, 'flame');
    expect(flame.length).toBeGreaterThan(5);
    expect(flame.every((s) => s.names.every((n) => n.slice(s.family.prefix.length).toLowerCase().includes('flame')))).toBe(true);
    // The prefix isn't searchable: "tb" doesn't list all of Tabler.
    expect(searchIconIndex(index, 'tb').find((s) => s.family.id === 'tb')?.names.length ?? 0).toBeLessThan(100);
    expect(searchIconIndex(index, 'flame off', 'tb').map((s) => s.names)).toEqual([expect.arrayContaining(['TbFlameOff'])]);
    // Extra terms (English names of the featured icons) widen a Spanish search.
    expect(countIcons(searchIconIndex(index, 'fuego'))).toBe(0);
    expect(searchIconIndex(index, 'fuego', 'tb', ['Flame'])[0].names).toContain('TbFlame');
  });

  it('shows readable names', () => {
    expect(iconLabel(getIconFamily('tb')!, 'TbFlameOff')).toBe('Flame Off');
    expect(iconLabel(getIconFamily('lia')!, 'LiaAngleDoubleUpSolid')).toBe('Angle Double Up Solid');
    expect(iconLabel(getIconFamily('md')!, 'Md3dRotation')).toBe('3d Rotation');
  });

  it("doesn't use the value as an emoji in notifications", () => {
    expect(iconEmoji('ri:tb:TbFlame', 'event')).toBe(iconEmoji(null, 'event'));
  });
});
