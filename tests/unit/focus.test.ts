import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureFocus } from '../../src/lib/focus';

function fakeElement(): { focus: ReturnType<typeof vi.fn> } {
  return { focus: vi.fn() };
}

describe('captureFocus', () => {
  let fakeDoc: {
    activeElement: unknown;
    body: unknown;
    documentElement: unknown;
    contains: ReturnType<typeof vi.fn>;
    querySelector: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    fakeDoc = {
      activeElement: null,
      body: { marker: 'body' },
      documentElement: { marker: 'html' },
      contains: vi.fn(() => true),
      querySelector: vi.fn(() => null),
    };
    vi.stubGlobal('document', fakeDoc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores focus to whatever really had it when captured', () => {
    const opener = fakeElement();
    fakeDoc.activeElement = opener;
    const restore = captureFocus();
    restore();
    expect(opener.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('does not try to restore to an element that has since left the document', () => {
    const opener = fakeElement();
    fakeDoc.activeElement = opener;
    fakeDoc.contains.mockReturnValue(false);
    const restore = captureFocus('[data-card-id="c1"]');
    const fallback = fakeElement();
    fakeDoc.querySelector.mockReturnValue(fallback);
    restore();
    expect(opener.focus).not.toHaveBeenCalled();
    expect(fallback.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('falls back to the selector when nothing had real focus (e.g. a click on a non-focusable tile)', () => {
    // document.activeElement is <body>, as happens when a click lands on an
    // element that is not itself focusable (the reported card-tile bug).
    fakeDoc.activeElement = fakeDoc.body;
    const fallback = fakeElement();
    fakeDoc.querySelector.mockReturnValue(fallback);
    const restore = captureFocus('[data-card-id="c1"]');
    restore();
    expect(fakeDoc.querySelector).toHaveBeenCalledWith('[data-card-id="c1"]');
    expect(fallback.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('is a no-op when there is no real focus and no matching fallback', () => {
    fakeDoc.activeElement = fakeDoc.body;
    const restore = captureFocus('[data-card-id="missing"]');
    expect(() => restore()).not.toThrow();
  });
});
