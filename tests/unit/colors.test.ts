import { describe, expect, it } from 'vitest';
import { contrastRatio, contrastText, getBoardBackground } from '../../src/lib/colors';
import { DARK_TEXT, LIGHT_TEXT } from '../../shared/palette.js';

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
      const alpha = bg.scrim ? Number(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(bg.scrim)?.[1]) : 0.24;
      expect(alpha).toBeGreaterThanOrEqual(0.24);
      const scrimmed = blackOver(lightest, alpha);
      expect(contrastRatio('#ffffff', scrimmed)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('computes a safe scrim for custom hex backgrounds, including near-white ones', () => {
    for (const hex of ['#ffffff', '#fdf2ff', '#222222', '#808080']) {
      const bg = getBoardBackground(`custom:${hex}`);
      const alpha = Number(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(bg.scrim ?? '')?.[1] ?? '0');
      const scrimmed = blackOver(hex, alpha);
      expect(contrastRatio('#ffffff', scrimmed)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/** Alpha-composites black at `alpha` over `hex` (same model as a CSS rgba(0,0,0,alpha) overlay). */
function blackOver(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - alpha)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
