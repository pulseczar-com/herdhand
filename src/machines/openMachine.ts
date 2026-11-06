import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Machine } from "./store";

/**
 * The machine that is open and connected, and whether its spaces are folded. The native SSH
 * module holds one connection, so one machine at a time is open.
 */
export type OpenMachine = { id: string; isFolded: boolean };

const OPEN_MACHINE_KEY = "machines.open";

/** The id of no machine: the connection hook looks it up, finds no machine and stays idle. */
export const NO_MACHINE = "";

/** Stored when the open machine is removed: no machine is open until the person taps a header. */
export const NONE_OPEN: OpenMachine = { id: NO_MACHINE, isFolded: true };

export async function getStoredOpenMachine(): Promise<OpenMachine | null> {
  const stored = await AsyncStorage.getItem(OPEN_MACHINE_KEY);
  return stored ? (JSON.parse(stored) as OpenMachine) : null;
}

export function saveOpenMachine(open: OpenMachine): Promise<void> {
  return AsyncStorage.setItem(OPEN_MACHINE_KEY, JSON.stringify(open));
}

/** The stored open machine while it still exists; otherwise the first machine, unfolded. */
export function resolveOpenMachine(machines: Machine[], stored: OpenMachine | null): OpenMachine | null {
  const [first] = machines;
  if (!first || stored?.id === NO_MACHINE) return null;
  if (stored && machines.some((machine) => machine.id === stored.id)) return stored;
  return { id: first.id, isFolded: false };
}

/** A tap on a machine's header: the open machine folds or unfolds; another machine opens. */
export function toggleMachine(open: OpenMachine | null, id: string): OpenMachine {
  if (open?.id === id) return { id, isFolded: !open.isFolded };
  return { id, isFolded: false };
}
