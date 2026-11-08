import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Space } from "@/herdr/backend";

import {
  getCollapsedSpaceIds,
  keepExistingSpaceIds,
  removeCollapsedSpaceIds,
  saveCollapsedSpaceIds,
  toggleSpaceId,
} from "./collapsedSpaces";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

function makeSpace(id: string): Space {
  return { id, name: id, tabs: [] };
}

beforeEach(() => AsyncStorage.clear());

describe("toggleSpaceId", () => {
  it.each([
    { when: "nothing is collapsed", ids: [], spaceId: "s1", expected: ["s1"] },
    { when: "another space is collapsed", ids: ["s2"], spaceId: "s1", expected: ["s2", "s1"] },
    { when: "the space is collapsed", ids: ["s1", "s2"], spaceId: "s1", expected: ["s2"] },
    { when: "only the space is collapsed", ids: ["s1"], spaceId: "s1", expected: [] },
  ])("toggles the space when $when", ({ ids, spaceId, expected }) => {
    expect(toggleSpaceId(ids, spaceId)).toEqual(expected);
  });
});

describe("keepExistingSpaceIds", () => {
  it.each([
    { when: "every space still exists", ids: ["s1", "s2"], spaces: ["s1", "s2", "s3"], expected: ["s1", "s2"] },
    { when: "a space is gone", ids: ["s1", "s2"], spaces: ["s2"], expected: ["s2"] },
    { when: "the machine has no spaces", ids: ["s1"], spaces: [], expected: [] },
    { when: "nothing is collapsed", ids: [], spaces: ["s1"], expected: [] },
  ])("keeps the ids of spaces that exist when $when", ({ ids, spaces, expected }) => {
    expect(keepExistingSpaceIds(ids, spaces.map(makeSpace))).toEqual(expected);
  });
});

describe("stored collapsed spaces", () => {
  it("starts with nothing collapsed", async () => {
    expect(await getCollapsedSpaceIds("m1", "desktop")).toEqual([]);
  });

  it("keeps each machine's spaces apart", async () => {
    await saveCollapsedSpaceIds("m1", "desktop", ["s1"]);
    await saveCollapsedSpaceIds("m2", "desktop", ["s2"]);

    expect(await getCollapsedSpaceIds("m1", "desktop")).toEqual(["s1"]);
    expect(await getCollapsedSpaceIds("m2", "desktop")).toEqual(["s2"]);
  });

  it("keeps each Herdr kind's spaces apart", async () => {
    await saveCollapsedSpaceIds("m1", "desktop", ["s1"]);

    expect(await getCollapsedSpaceIds("m1", "tui")).toEqual([]);
  });

  it.each([
    { when: "is not JSON", stored: "{not json", expected: [] },
    { when: "is not an array", stored: '{"a":1}', expected: [] },
    { when: "holds other values than ids", stored: '["s1",2,null]', expected: ["s1"] },
  ])("reads nothing wrong when the stored value $when", async ({ stored, expected }) => {
    await AsyncStorage.setItem("spaces.collapsed.m1.desktop", stored);

    expect(await getCollapsedSpaceIds("m1", "desktop")).toEqual(expected);
  });

  it("removes the collapsed spaces of every kind of a machine", async () => {
    await saveCollapsedSpaceIds("m1", "desktop", ["s1"]);
    await saveCollapsedSpaceIds("m1", "tui", ["w1"]);

    await removeCollapsedSpaceIds("m1");

    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it("removes the key when nothing is collapsed", async () => {
    await saveCollapsedSpaceIds("m1", "desktop", ["s1"]);
    await saveCollapsedSpaceIds("m1", "desktop", []);

    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
