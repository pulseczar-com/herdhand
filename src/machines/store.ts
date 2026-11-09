import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import type { HerdrKind } from "@/herdr/kinds";

import { DEMO_MACHINE, isDemoMachine } from "@/demo/demoMachine";
import { removeSpaceOrder } from "@/spaceOrder/store";

import { removeCollapsedSpaceIds } from "./collapsedSpaces";

/**
 * How the app logs in: with a password, or with this phone's key after pairing by code.
 * Machines saved before pairing existed have no value, which means a password.
 */
export type SignIn = "password" | "phoneKey";

/** A machine the app connects to. Its password and trusted host key live in secure storage. */
export type Machine = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  /** The Herdr kind last chosen, when the machine offers both. */
  kind?: HerdrKind;
  signIn?: SignIn;
};

export type NewMachine = Omit<Machine, "id" | "kind" | "signIn">;

const MACHINES_KEY = "machines";

export async function listMachines(): Promise<Machine[]> {
  const stored = await AsyncStorage.getItem(MACHINES_KEY);
  return stored ? (JSON.parse(stored) as Machine[]) : [];
}

export async function getMachine(id: string): Promise<Machine | undefined> {
  const machines = await listMachines();
  return machines.find((machine) => machine.id === id);
}

/** Saves a new machine, with its password in secure storage. */
export async function addMachine(input: NewMachine, password: string): Promise<Machine> {
  const machine: Machine = { id: makeId(), ...input };
  await SecureStore.setItemAsync(getPasswordKey(machine.id), password);
  const machines = await listMachines();
  await saveMachines([...machines, machine]);
  return machine;
}

/** Saves a machine paired by code: it logs in with the phone key and trusts the host key it checked. */
export async function addPairedMachine(input: NewMachine, fingerprint: string): Promise<Machine> {
  const machine: Machine = { id: makeId(), ...input, signIn: "phoneKey" };
  await saveTrustedFingerprint(machine.id, fingerprint);
  const machines = await listMachines();
  await saveMachines([...machines, machine]);
  return machine;
}

/** Saves the demo machine, unless it is saved already. It has no password and no host key to keep. */
export async function addDemoMachine(): Promise<void> {
  const machines = await listMachines();
  if (machines.some(isDemoMachine)) return;
  await saveMachines([...machines, DEMO_MACHINE]);
}

/**
 * Saves new details for a machine, in place, so its order and chosen kind stay. A new
 * address or port is a different machine to the SSH layer, so the trusted host key is dropped
 * and the next connect asks to trust the key it finds. A null password, for a machine paired by
 * code, saves none.
 */
export async function updateMachine(id: string, input: NewMachine, password: string | null): Promise<void> {
  const machines = await listMachines();
  const current = machines.find((machine) => machine.id === id);
  if (!current) throw new Error(`No machine with id ${id}`);
  const updated: Machine = { ...current, ...input };
  if (password !== null) await SecureStore.setItemAsync(getPasswordKey(id), password);
  const isNewAddress = updated.host !== current.host || updated.port !== current.port;
  if (isNewAddress) {
    await SecureStore.deleteItemAsync(getFingerprintKey(id));
  }
  await saveMachines(machines.map((machine) => (machine.id === id ? updated : machine)));
}

export async function removeMachine(id: string): Promise<void> {
  const machines = await listMachines();
  await saveMachines(machines.filter((machine) => machine.id !== id));
  await SecureStore.deleteItemAsync(getPasswordKey(id));
  await SecureStore.deleteItemAsync(getFingerprintKey(id));
  await removeCollapsedSpaceIds(id);
  await removeSpaceOrder(id);
}

/** Moves the machine at `from` to `to` in the list, after a drag. */
export async function moveMachine(from: number, to: number): Promise<void> {
  const machines = await listMachines();
  const [moved] = machines.splice(from, 1);
  machines.splice(to, 0, moved);
  await saveMachines(machines);
}

export async function saveMachineKind(id: string, kind: HerdrKind): Promise<void> {
  const machines = await listMachines();
  await saveMachines(machines.map((machine) => (machine.id === id ? { ...machine, kind } : machine)));
}

export function getPassword(id: string): Promise<string | null> {
  return SecureStore.getItemAsync(getPasswordKey(id));
}

/** The password the machine logs in with, or null when it logs in with the phone key. */
export async function getSignInPassword(machine: Machine): Promise<string | null> {
  if (machine.signIn === "phoneKey") return null;
  return (await getPassword(machine.id)) ?? "";
}

export function getTrustedFingerprint(id: string): Promise<string | null> {
  return SecureStore.getItemAsync(getFingerprintKey(id));
}

export function saveTrustedFingerprint(id: string, fingerprint: string): Promise<void> {
  return SecureStore.setItemAsync(getFingerprintKey(id), fingerprint);
}

function saveMachines(machines: Machine[]): Promise<void> {
  return AsyncStorage.setItem(MACHINES_KEY, JSON.stringify(machines));
}

// Unique enough for one person's list of machines, with no extra native module.
function makeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Secure store keys allow letters, digits, ".", "-" and "_" only.
function getPasswordKey(id: string): string {
  return `machine.${id}.password`;
}

function getFingerprintKey(id: string): string {
  return `machine.${id}.fingerprint`;
}
