import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  addMachine,
  addPairedMachine,
  getMachine,
  getPassword,
  getSignInPassword,
  getTrustedFingerprint,
  listMachines,
  moveMachine,
  removeMachine,
  saveMachineKind,
  saveTrustedFingerprint,
  updateMachine,
} from "./store";
import { getSpaceOrder, saveSpaceOrder } from "@/spaceOrder/store";

import { getCollapsedSpaceIds, saveCollapsedSpaceIds } from "./collapsedSpaces";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void values.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void values.delete(key)),
  };
});

const newMachine = { name: "test-box", host: "test-box.example.com", port: 22, user: "tester" };

async function allAsyncStorageText(): Promise<string> {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  return JSON.stringify(pairs);
}

describe("machines store", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("adds, lists and removes a machine", async () => {
    const machine = await addMachine(newMachine, "secret");

    expect(await listMachines()).toEqual([{ id: machine.id, ...newMachine }]);
    expect(await getMachine(machine.id)).toEqual(machine);

    await removeMachine(machine.id);

    expect(await listMachines()).toEqual([]);
    expect(await getPassword(machine.id)).toBeNull();
  });

  it("adds a machine paired by code with its host key and no password", async () => {
    const machine = await addPairedMachine(newMachine, "SHA256:paired");

    expect(await getMachine(machine.id)).toEqual({ id: machine.id, ...newMachine, signIn: "phoneKey" });
    expect(await getTrustedFingerprint(machine.id)).toBe("SHA256:paired");
    expect(await getPassword(machine.id)).toBeNull();
  });

  it.each([
    { signIn: undefined, expected: "secret" },
    { signIn: "password", expected: "secret" },
    { signIn: "phoneKey", expected: null },
  ] as const)("logs a machine with sign-in $signIn in with password $expected", async ({ signIn, expected }) => {
    const machine = await addMachine(newMachine, "secret");

    expect(await getSignInPassword({ ...machine, signIn })).toBe(expected);
  });

  it("starts with an empty list", async () => {
    expect(await listMachines()).toEqual([]);
  });

  it("keeps the password and fingerprint out of AsyncStorage", async () => {
    const machine = await addMachine(newMachine, "secret-password");
    await saveTrustedFingerprint(machine.id, "SHA256:fingerprint");

    const stored = await allAsyncStorageText();

    expect(stored).not.toContain("secret-password");
    expect(stored).not.toContain("SHA256:fingerprint");
    expect(await getPassword(machine.id)).toBe("secret-password");
    expect(await getTrustedFingerprint(machine.id)).toBe("SHA256:fingerprint");
  });

  it("removes the collapsed spaces with the machine", async () => {
    const machine = await addMachine(newMachine, "secret");
    await saveCollapsedSpaceIds(machine.id, "desktop", ["s1"]);

    await removeMachine(machine.id);

    expect(await getCollapsedSpaceIds(machine.id, "desktop")).toEqual([]);
  });

  it("removes the space order with the machine", async () => {
    const machine = await addMachine(newMachine, "secret");
    await saveSpaceOrder(machine.id, "tui", ["s1", "s2"]);

    await removeMachine(machine.id);

    expect(await getSpaceOrder(machine.id, "tui")).toEqual([]);
  });

  it.each([
    { when: "down to the end", from: 0, to: 2, expected: ["b", "c", "a"] },
    { when: "up to the start", from: 2, to: 0, expected: ["c", "a", "b"] },
    { when: "to the same place", from: 1, to: 1, expected: ["a", "b", "c"] },
  ])("moves a machine $when", async ({ from, to, expected }) => {
    for (const name of ["a", "b", "c"]) await addMachine({ ...newMachine, name }, "secret");

    await moveMachine(from, to);

    expect((await listMachines()).map((machine) => machine.name)).toEqual(expected);
  });

  it("removes the fingerprint with the machine", async () => {
    const machine = await addMachine(newMachine, "secret");
    await saveTrustedFingerprint(machine.id, "SHA256:fingerprint");

    await removeMachine(machine.id);

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(`machine.${machine.id}.fingerprint`);
    expect(await getTrustedFingerprint(machine.id)).toBeNull();
  });

  it("saves the chosen Herdr kind", async () => {
    const machine = await addMachine(newMachine, "secret");

    await saveMachineKind(machine.id, "tui");

    expect(await getMachine(machine.id)).toEqual({ ...machine, kind: "tui" });
  });

  describe("updateMachine", () => {
    it("saves the new details in place, keeping the id, the order and the chosen kind", async () => {
      await addMachine({ ...newMachine, name: "first" }, "secret");
      const machine = await addMachine(newMachine, "secret");
      await addMachine({ ...newMachine, name: "last" }, "secret");
      await saveMachineKind(machine.id, "tui");

      await updateMachine(machine.id, { ...newMachine, name: "renamed", user: "other-user" }, "new-secret");

      const names = (await listMachines()).map((saved) => saved.name);
      expect(names).toEqual(["first", "renamed", "last"]);
      expect(await getMachine(machine.id)).toEqual({ id: machine.id, ...newMachine, name: "renamed", user: "other-user", kind: "tui" });
      expect(await getPassword(machine.id)).toBe("new-secret");
    });

    it("leaves a machine paired by code without a password", async () => {
      const machine = await addPairedMachine(newMachine, "SHA256:paired");

      await updateMachine(machine.id, { ...newMachine, name: "renamed" }, null);

      expect(await getMachine(machine.id)).toEqual({ id: machine.id, ...newMachine, name: "renamed", signIn: "phoneKey" });
      expect(await getPassword(machine.id)).toBeNull();
    });

    it.each([
      { change: "host", edit: { host: "other-box.example.com" }, keeps: false },
      { change: "port", edit: { port: 2222 }, keeps: false },
      { change: "name", edit: { name: "renamed" }, keeps: true },
      { change: "user", edit: { user: "other-user" }, keeps: true },
    ])("$change changed: keeps the host key is $keeps", async ({ edit, keeps }) => {
      const machine = await addMachine(newMachine, "secret");
      await saveTrustedFingerprint(machine.id, "SHA256:fingerprint");

      await updateMachine(machine.id, { ...newMachine, ...edit }, "secret");

      expect(await getTrustedFingerprint(machine.id)).toBe(keeps ? "SHA256:fingerprint" : null);
    });
  });
});
