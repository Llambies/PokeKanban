/**
 * Drag & drop works on the *visible* cards (filters may hide some). These helpers
 * translate a position among visible ids into a position in the full ordered array.
 * Both arrays must already exclude the dragged id.
 */
export function visibleToFullIndex(fullIds: string[], visibleIds: string[], visibleIndex: number): number {
  if (visibleIds.length === 0) return fullIds.length;
  if (visibleIndex >= visibleIds.length) {
    const last = visibleIds[visibleIds.length - 1];
    return fullIds.indexOf(last) + 1;
  }
  const idx = fullIds.indexOf(visibleIds[visibleIndex]);
  return idx === -1 ? fullIds.length : idx;
}

export function moveInArray<T>(arr: T[], from: number, to: number): void {
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
}
