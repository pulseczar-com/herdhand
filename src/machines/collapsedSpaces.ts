import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Space } from "@/herdr/backend";
import { HERDR_KINDS, type HerdrKind } from "@/herdr/kinds";
import { parseStoredOrder } from "@/spaceOrder/order";

// Only collapsed spaces are stored, so a new space starts expanded.
const COLLAPSED_SPACES_KEY_PREFIX = "spaces.collapsed.";

/**
 * The ids of one Herdr kind's spaces on a machine that the person collapsed on this phone. Each
 * kind has its own list, because the kinds have different space ids.
 */
export async function getCollapsedSpaceIds(machineId: string, kind: HerdrKind): Promise<string[]> {
  const stored = await AsyncStorage.getItem(getCollapsedSpacesKey(machineId, kind));
  return parseStoredOrder(stored);
}

/** Saves the collapsed spaces; with none, removes the key so no empty key stays behind. */
export function saveCollapsedSpaceIds(machineId: string, kind: HerdrKind, spaceIds: string[]): Promise<void> {
  const key = getCollapsedSpacesKey(machineId, kind);
  if (spaceIds.length === 0) return AsyncStorage.removeItem(key);
  return AsyncStorage.setItem(key, JSON.stringify(spaceIds));
}

export function removeCollapsedSpaceIds(machineId: string): Promise<void> {
  return AsyncStorage.multiRemove(HERDR_KINDS.map((kind) => getCollapsedSpacesKey(machineId, kind)));
}

function getCollapsedSpacesKey(machineId: string, kind: HerdrKind): string {
  return `${COLLAPSED_SPACES_KEY_PREFIX}${machineId}.${kind}`;
}

/** Collapses the space when it is expanded, and expands it when it is collapsed. */
export function toggleSpaceId(spaceIds: string[], spaceId: string): string[] {
  if (spaceIds.includes(spaceId)) return spaceIds.filter((id) => id !== spaceId);
  return [...spaceIds, spaceId];
}

/** The collapsed ids of spaces that still exist, so a closed space leaves nothing stored. */
export function keepExistingSpaceIds(spaceIds: string[], spaces: Space[]): string[] {
  const existingIds = new Set(spaces.map((space) => space.id));
  return spaceIds.filter((id) => existingIds.has(id));
}
