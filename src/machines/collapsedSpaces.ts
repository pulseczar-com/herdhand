import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Space } from "@/herdr/backend";

// Only collapsed spaces are stored, so a new space starts expanded.
const COLLAPSED_SPACES_KEY_PREFIX = "spaces.collapsed.";

/** The ids of the machine's spaces that the person collapsed on this phone. */
export async function getCollapsedSpaceIds(machineId: string): Promise<string[]> {
  const stored = await AsyncStorage.getItem(getCollapsedSpacesKey(machineId));
  return stored ? (JSON.parse(stored) as string[]) : [];
}

/** Saves the collapsed spaces; with none, removes the key so no empty key stays behind. */
export function saveCollapsedSpaceIds(machineId: string, spaceIds: string[]): Promise<void> {
  if (spaceIds.length === 0) return removeCollapsedSpaceIds(machineId);
  return AsyncStorage.setItem(getCollapsedSpacesKey(machineId), JSON.stringify(spaceIds));
}

export function removeCollapsedSpaceIds(machineId: string): Promise<void> {
  return AsyncStorage.removeItem(getCollapsedSpacesKey(machineId));
}

function getCollapsedSpacesKey(machineId: string): string {
  return COLLAPSED_SPACES_KEY_PREFIX + machineId;
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
