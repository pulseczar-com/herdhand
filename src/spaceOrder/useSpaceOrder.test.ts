import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { Space } from "@/herdr/backend";

import { getSpaceOrder, saveSpaceOrder } from "./store";
import { useSpaceOrder } from "./useSpaceOrder";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const spaces = (...ids: string[]): Space[] => ids.map((id) => ({ id, name: id, tabs: [] }));
const getIds = (list: Space[]) => list.map((space) => space.id);

beforeEach(() => AsyncStorage.clear());

describe("useSpaceOrder", () => {
  it("shows the spaces in Herdr's order on a new phone", async () => {
    const { result } = renderHook(() => useSpaceOrder("m1", "desktop", spaces("s1", "s2")));

    await waitFor(async () => expect(await getSpaceOrder("m1", "desktop")).toEqual(["s1", "s2"]));
    expect(getIds(result.current.spaces)).toEqual(["s1", "s2"]);
  });

  it("drops a closed space from the stored order", async () => {
    await saveSpaceOrder("m1", "desktop", ["s1", "s2"]);

    renderHook(() => useSpaceOrder("m1", "desktop", spaces("s2")));

    await waitFor(async () => expect(await getSpaceOrder("m1", "desktop")).toEqual(["s2"]));
  });

  it("shows no spaces and keeps the stored order while the list is not loaded", async () => {
    await saveSpaceOrder("m1", "desktop", ["s1"]);
    const { result } = renderHook(() => useSpaceOrder("m1", "desktop", null));
    await act(async () => {});

    expect(result.current.spaces).toEqual([]);
    expect(await getSpaceOrder("m1", "desktop")).toEqual(["s1"]);
  });

  it("moves a space and saves the order", async () => {
    const { result } = renderHook(() => useSpaceOrder("m1", "desktop", spaces("s1", "s2")));
    await waitFor(async () => expect(await getSpaceOrder("m1", "desktop")).toHaveLength(2));

    act(() => result.current.moveSpace(1, 0));

    expect(getIds(result.current.spaces)).toEqual(["s2", "s1"]);
    await waitFor(async () => expect(await getSpaceOrder("m1", "desktop")).toEqual(["s2", "s1"]));
  });

  it("keeps one kind's order when the other kind's spaces show, and brings it back", async () => {
    await saveSpaceOrder("m1", "desktop", ["d2", "d1"]);
    const { result, rerender } = renderHook(
      ({ kind, ids }: { kind: "desktop" | "tui"; ids: string[] }) => useSpaceOrder("m1", kind, spaces(...ids)),
      { initialProps: { kind: "desktop", ids: ["d1", "d2"] } },
    );
    await waitFor(() => expect(getIds(result.current.spaces)).toEqual(["d2", "d1"]));

    rerender({ kind: "tui", ids: ["t1"] });
    await waitFor(async () => expect(await getSpaceOrder("m1", "tui")).toEqual(["t1"]));
    expect(getIds(result.current.spaces)).toEqual(["t1"]);
    expect(await getSpaceOrder("m1", "desktop")).toEqual(["d2", "d1"]);

    rerender({ kind: "desktop", ids: ["d1", "d2"] });
    await waitFor(() => expect(getIds(result.current.spaces)).toEqual(["d2", "d1"]));
  });

  it("saves nothing until the kind is known", async () => {
    await saveSpaceOrder("m1", "desktop", ["s1"]);

    const { result } = renderHook(() => useSpaceOrder("m1", null, spaces("s2")));
    await act(async () => {});

    expect(getIds(result.current.spaces)).toEqual(["s2"]);
    expect(await AsyncStorage.getAllKeys()).toEqual(["spaceOrder.m1.desktop"]);
    expect(await getSpaceOrder("m1", "desktop")).toEqual(["s1"]);
  });
});
