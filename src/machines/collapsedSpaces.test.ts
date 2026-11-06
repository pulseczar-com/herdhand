import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Space } from "@/herdr/backend";

import { getCollapsedSpaceIds, keepExistingSpaceIds, saveCollapsedSpaceIds, toggleSpaceId } from "./collapsedSpaces";

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
    expect(await getCollapsedSpaceIds("m1")).toEqual([]);
  });

  it("keeps each machine's spaces apart", async () => {
    await saveCollapsedSpaceIds("m1", ["s1"]);
    await saveCollapsedSpaceIds("m2", ["s2"]);

    expect(await getCollapsedSpaceIds("m1")).toEqual(["s1"]);
    expect(await getCollapsedSpaceIds("m2")).toEqual(["s2"]);
  });

  it("removes the key when nothing is collapsed", async () => {
    await saveCollapsedSpaceIds("m1", ["s1"]);
    await saveCollapsedSpaceIds("m1", []);

    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
