/** Card under the mouse pointer: target of single-key shortcuts (like Trello). */
let hovered: string | null = null;

export function setHoveredCard(id: string | null): void {
  hovered = id;
}

export function clearHoveredCard(id: string): void {
  if (hovered === id) hovered = null;
}

/** Hovered card, or the card tile that has keyboard focus. */
export function getTargetCard(): string | null {
  const focused = document.activeElement as HTMLElement | null;
  const fromFocus = focused?.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
  return fromFocus ?? hovered;
}
