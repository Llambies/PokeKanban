import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_GROUPS, BOARD_BACKGROUNDS, backgroundGroupOf, getBoardBackground, parsePattern, patternKey, PATTERN_COLORS, PATTERNS,
  SKY_KEY, SKY_PERIODS, skyBackground, skyPeriod,
} from '../../src/lib/backgrounds';
import { contrastRatio, contrastText } from '../../src/lib/colors';
import { DARK_TEXT, HUES, iconColor, LIGHT_TEXT } from '../../shared/palette.js';

describe('contrastText', () => {
  it('picks white on clearly dark backgrounds', () => {
    expect(contrastText('#0c4aa6')).toBe(LIGHT_TEXT);
  });

  it('picks dark text on clearly light backgrounds', () => {
    expect(contrastText('#fdd0ec')).toBe(DARK_TEXT);
  });

  it('picks whichever text has the higher actual contrast on mid-luminance colors', () => {
    // Regression for the old fixed 0.36 luminance threshold: this teal sits just
    // above that cutoff (so it used to get dark text) even though white text
    // contrasts better against it.
    const hex = '#4bbf6b';
    const withDark = contrastRatio(hex, DARK_TEXT);
    const withLight = contrastRatio(hex, LIGHT_TEXT);
    const picked = contrastText(hex);
    expect(picked).toBe(withLight > withDark ? LIGHT_TEXT : DARK_TEXT);
  });

  it('always reaches at least as much contrast as the fixed-threshold rule would miss', () => {
    // A sample of light/custom colors from the board palette: whichever text
    // contrastText() picks must have >= contrast than the other option.
    const samples = ['#b99fd0', '#94c748', '#f5cd47', '#00aecc', '#d29034', '#838c91'];
    for (const hex of samples) {
      const picked = contrastText(hex);
      const other = picked === DARK_TEXT ? LIGHT_TEXT : DARK_TEXT;
      expect(contrastRatio(hex, picked)).toBeGreaterThanOrEqual(contrastRatio(hex, other));
    }
  });
});

describe('contrastRatio', () => {
  it('is 1 for identical colors and 21 for black vs white', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});

describe('getBoardBackground scrim', () => {
  it('gives every light preset a strong enough scrim for >=4.5:1 white text', () => {
    // Mirrors the per-preset tuning: white text over black-scrim(alpha) composited
    // on the background's lightest color must clear WCAG AA (4.5:1).
    const lightestByKey: Record<string, string> = {
      ocean: '#0c66e4',
      sunset: '#e774bb',
      forest: '#1f845a',
      aurora: '#4bce97',
      dusk: '#6e5dc6',
      fire: '#f5cd47',
      candy: '#cce0ff',
      night: '#44546f',
      blue: '#0079bf',
      green: '#519839',
      orange: '#d29034',
      red: '#b04632',
      purple: '#89609e',
      pink: '#cd5a91',
      lime: '#4bbf6b',
      sky: '#00aecc',
      grey: '#838c91',
    };
    for (const [key, lightest] of Object.entries(lightestByKey)) {
      const bg = getBoardBackground(key);
      const alpha = scrimAlpha(bg.scrim);
      expect(alpha).toBeGreaterThanOrEqual(0.24);
      const scrimmed = blackOver(lightest, alpha);
      expect(contrastRatio('#ffffff', scrimmed)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives every other preset enough scrim for its lightest color', () => {
    // The colors inside url("…") layers (stars, windows, the Poké Ball) are small details, not
    // what the text sits on. Scenes are checked apart: their horizon is brighter than their top.
    for (const group of BACKGROUND_GROUPS) {
      if (group.key === 'scene') continue;
      for (const bg of group.items) {
        const hexes = bg.css.replace(/url\("[^"]*"\)/g, '').match(/#[0-9a-f]{6}\b/gi) ?? [];
        expect(hexes.length, bg.key).toBeGreaterThan(0);
        for (const hex of hexes) expect(contrastRatio('#ffffff', blackOver(hex, scrimAlpha(bg.scrim))), `${bg.key} ${hex}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('gives the scenes enough scrim for the top of their sky', () => {
    const topByKey: Record<string, string> = {
      mountains: '#352c63',
      dunes: '#e0703c',
      sea: '#579dff',
      pines: '#17684a',
      city: '#1b1740',
      stars: '#06132b',
    };
    for (const [key, top] of Object.entries(topByKey)) {
      const bg = getBoardBackground(key);
      expect(bg.key).toBe(key);
      expect(contrastRatio('#ffffff', blackOver(top, scrimAlpha(bg.scrim))), key).toBeGreaterThanOrEqual(4.5);
    }
    const skyTops = { dawn: '#6e5dc6', day: '#0c66e4', dusk: '#352c63', night: '#05102a' };
    for (const period of SKY_PERIODS) {
      expect(contrastRatio('#ffffff', blackOver(skyTops[period], scrimAlpha(skyBackground(period).scrim))), period).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives patterns a safe scrim on any color, including light ones', () => {
    for (const { hex } of [...PATTERN_COLORS, { hex: '#ffffff' }, { hex: '#f5cd47' }]) {
      for (const { key } of PATTERNS) {
        const bg = getBoardBackground(patternKey(key, hex));
        expect(contrastRatio('#ffffff', blackOver(hex, scrimAlpha(bg.scrim))), `${key} ${hex}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('computes a safe scrim for custom hex backgrounds, including near-white ones', () => {
    for (const hex of ['#ffffff', '#fdf2ff', '#222222', '#808080']) {
      const bg = getBoardBackground(`custom:${hex}`);
      const alpha = scrimAlpha(bg.scrim);
      const scrimmed = blackOver(hex, alpha);
      expect(contrastRatio('#ffffff', scrimmed)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('board backgrounds', () => {
  it('has unique keys and names, and no key that looks like a prefixed one', () => {
    const keys = BOARD_BACKGROUNDS.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(BOARD_BACKGROUNDS.map((b) => b.name)).size).toBe(keys.length);
    for (const key of keys) expect(key).not.toMatch(/:/);
  });

  it('keeps the keys boards already use', () => {
    const before = ['ocean', 'sunset', 'forest', 'aurora', 'dusk', 'fire', 'candy', 'night', 'blue', 'green', 'orange', 'red', 'purple', 'pink', 'lime', 'sky', 'grey'];
    for (const key of before) expect(getBoardBackground(key).key).toBe(key);
    expect(getBoardBackground('sky').name).toBe('Celeste');
    expect(getBoardBackground('no-such-background').key).toBe('ocean');
  });

  it('builds a pattern from its type and color', () => {
    const key = patternKey('waves', '#AE4787');
    expect(key).toBe('pattern:waves:#ae4787');
    expect(parsePattern(key)).toEqual({ pattern: 'waves', color: '#ae4787' });
    const bg = getBoardBackground(key);
    expect(bg.name).toBe('Olas');
    expect(bg.base).toBe('#ae4787');
    expect(bg.css).toContain('#ae4787');
    // Same pattern, other color: only the color changes.
    expect(getBoardBackground(patternKey('waves', '#1f845a')).css).toContain('#1f845a');
    expect(parsePattern('ocean')).toBeNull();
  });

  it('falls back to a valid pattern and color instead of putting junk in the css', () => {
    expect(parsePattern('pattern:nope:#12345')).toEqual({ pattern: 'dots', color: '#0c66e4' });
    const bg = getBoardBackground('pattern:dots:red;background:url(x)');
    expect(bg.css).not.toContain('url(x)');
    expect(bg.base).toBe('#0c66e4');
  });

  it('uses dark ink for patterns on light colors and white ink on dark ones', () => {
    expect(getBoardBackground(patternKey('dots', '#dcdfe4')).css).toContain('rgba(23, 43, 77');
    expect(getBoardBackground(patternKey('dots', '#0c66e4')).css).toContain('rgba(255, 255, 255');
  });

  it('opens the picker on the collection of the current background', () => {
    expect(backgroundGroupOf('ocean')).toBe('gradient');
    expect(backgroundGroupOf('nebula')).toBe('mesh');
    expect(backgroundGroupOf('pattern:grid:#0c66e4')).toBe('pattern');
    expect(backgroundGroupOf('mountains')).toBe('scene');
    expect(backgroundGroupOf(SKY_KEY)).toBe('scene');
    expect(backgroundGroupOf('type-fire')).toBe('type');
    expect(backgroundGroupOf('grey')).toBe('solid');
    expect(backgroundGroupOf('custom:#123456')).toBe('solid');
    expect(backgroundGroupOf('image:https://example.com/a.jpg')).toBeNull();
  });

  it('changes the sky with the time of day', () => {
    const at = (hour: number) => new Date(2026, 10, 17, hour, 30);
    expect([5, 6, 8, 9, 17, 18, 20, 21, 0].map((h) => skyPeriod(at(h)))).toEqual(['night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night']);
    const looks = SKY_PERIODS.map((p) => skyBackground(p).css);
    expect(new Set(looks).size).toBe(4);
    expect(getBoardBackground(SKY_KEY, at(12)).css).toBe(skyBackground('day').css);
    expect(getBoardBackground(SKY_KEY, at(23)).css).toBe(skyBackground('night').css);
    expect(getBoardBackground(SKY_KEY, at(23)).name).toBe('Cielo');
  });

  it('draws the scenes the same way every time, in a reasonable size', () => {
    for (const bg of BOARD_BACKGROUNDS) expect(bg.css.length, bg.key).toBeLessThan(6000);
    expect(getBoardBackground('city').css).toMatch(/^url\("data:image\/svg\+xml,/);
  });
});

function scrimAlpha(scrim: string | undefined): number {
  return scrim ? Number(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(scrim)?.[1]) : 0.24;
}

/** Alpha-composites black at `alpha` over `hex` (same model as a CSS rgba(0,0,0,alpha) overlay). */
function blackOver(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - alpha)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

describe('iconColor', () => {
  it('uses the bold shade on light backgrounds and the normal one on dark backgrounds', () => {
    expect(iconColor('green_subtle', 'light')).toBe('#1F845A');
    expect(iconColor('green_bold', 'dark')).toBe('#4BCE97');
    expect(iconColor(null, 'light')).toBeNull();
    expect(iconColor('nope', 'dark')).toBeNull();
  });

  it('always reads on the background, also with custom colors', () => {
    const keys = [...HUES.flatMap((h) => [h.hue, `${h.hue}_subtle`, `${h.hue}_bold`]), '#FFF5F5', '#111111', '#7F7F7F'];
    for (const key of keys) {
      expect(contrastRatio(iconColor(key, 'light')!, '#FFFFFF')).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(iconColor(key, 'dark')!, '#22272B')).toBeGreaterThanOrEqual(3);
    }
  });
});
