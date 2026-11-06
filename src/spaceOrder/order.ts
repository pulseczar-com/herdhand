// The phone's order for one machine's spaces: the ids of Herdr's spaces, first to last. Every
// function returns a new array, or the same one when nothing changes.

/**
 * The order for the spaces Herdr has now: a space the order does not name goes at the end, in
 * Herdr's order, and a space Herdr closed drops out.
 */
export function settleOrder(order: string[], spaceIds: string[]): string[] {
  const existing = new Set(spaceIds);
  const kept = order.filter((id) => existing.has(id));
  const placed = new Set(kept);
  const added = spaceIds.filter((id) => !placed.has(id));
  if (added.length === 0 && kept.length === order.length) return order;
  return [...kept, ...added];
}

/** The order in a stored value. A value that is not an array of ids, or not readable, gives an empty order. */
export function parseStoredOrder(stored: string | null): string[] {
  try {
    const value: unknown = JSON.parse(stored ?? "null");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
