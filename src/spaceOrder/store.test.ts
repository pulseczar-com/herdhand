import AsyncStorage from "@react-native-async-storage/async-storage";

import { getSpaceOrder, removeSpaceOrder, saveSpaceOrder } from "./store";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

beforeEach(() => AsyncStorage.clear());

describe("stored space order", () => {
  it("starts empty", async () => {
    expect(await getSpaceOrder("m1", "desktop")).toEqual([]);
  });

  it("keeps each machine's order apart", async () => {
    await saveSpaceOrder("m1", "desktop", ["s2", "s1"]);

    expect(await getSpaceOrder("m1", "desktop")).toEqual(["s2", "s1"]);
    expect(await getSpaceOrder("m2", "desktop")).toEqual([]);
  });

  it("keeps each Herdr kind's order apart", async () => {
    await saveSpaceOrder("m1", "desktop", ["s2", "s1"]);

    expect(await getSpaceOrder("m1", "tui")).toEqual([]);
  });

  it("removes the order of every kind of a machine", async () => {
    await saveSpaceOrder("m1", "desktop", ["s1"]);
    await saveSpaceOrder("m1", "tui", ["s1"]);
    await removeSpaceOrder("m1");

    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
