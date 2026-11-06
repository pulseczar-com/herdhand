import AsyncStorage from "@react-native-async-storage/async-storage";

import { getStoredOpenMachine, NONE_OPEN, type OpenMachine, resolveOpenMachine, saveOpenMachine, toggleMachine } from "./openMachine";
import type { Machine } from "./store";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

function makeMachine(id: string): Machine {
  return { id, name: id, host: `${id}.example.com`, port: 22, user: "test-user" };
}

const machines = [makeMachine("m1"), makeMachine("m2")];

describe("resolveOpenMachine", () => {
  it.each<[string, Machine[], OpenMachine | null, OpenMachine | null]>([
    ["no machines", [], null, null],
    ["no machines, a stale stored one", [], { id: "m1", isFolded: false }, null],
    ["nothing stored: the first machine, open", machines, null, { id: "m1", isFolded: false }],
    ["the stored machine and its fold", machines, { id: "m2", isFolded: true }, { id: "m2", isFolded: true }],
    ["none open after a remove: no machine, whatever is saved", machines, NONE_OPEN, null],
    ["a removed machine: the first, open", machines, { id: "gone", isFolded: true }, { id: "m1", isFolded: false }],
  ])("%s", (_case, list, stored, expected) => {
    expect(resolveOpenMachine(list, stored)).toEqual(expected);
  });
});

describe("toggleMachine", () => {
  it.each<[string, OpenMachine | null, string, OpenMachine]>([
    ["folds the open machine", { id: "m1", isFolded: false }, "m1", { id: "m1", isFolded: true }],
    ["unfolds the open machine", { id: "m1", isFolded: true }, "m1", { id: "m1", isFolded: false }],
    ["opens another machine, unfolded", { id: "m1", isFolded: false }, "m2", { id: "m2", isFolded: false }],
    ["opens another machine when the open one is folded", { id: "m1", isFolded: true }, "m2", { id: "m2", isFolded: false }],
    ["opens a machine when none is open", null, "m2", { id: "m2", isFolded: false }],
  ])("%s", (_case, open, id, expected) => {
    expect(toggleMachine(open, id)).toEqual(expected);
  });
});

describe("the stored open machine", () => {
  beforeEach(() => AsyncStorage.clear());

  it("is null until one is saved", async () => {
    expect(await getStoredOpenMachine()).toBeNull();
  });

  it("reads back what was saved", async () => {
    await saveOpenMachine({ id: "m2", isFolded: true });

    expect(await getStoredOpenMachine()).toEqual({ id: "m2", isFolded: true });
  });
});
