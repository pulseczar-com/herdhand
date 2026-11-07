import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ActivityIndicator, FlatList, Text } from "react-native";
import ReorderableList from "react-native-reorderable-list";

import type { Backend, Pane, Space } from "@/herdr/backend";
import { getCollapsedSpaceIds, saveCollapsedSpaceIds } from "@/machines/collapsedSpaces";
import { useSpaces } from "@/machines/useSpaces";
import { getSpaceOrder, saveSpaceOrder } from "@/spaceOrder/store";
import { useSpaceOrder } from "@/spaceOrder/useSpaceOrder";

import { SpaceList } from "./SpaceList";
import { StateDot } from "./StatePill";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => ({
  useTheme: () => ({ dark: false, colors: { text: "#000", border: "#000", background: "#fff", notification: "#f00" } }),
}));

// The first render in this file loads React Native's list modules, which can take over 5 s on a cold CI runner.
jest.setTimeout(20_000);

const MACHINE_ID = "m1";

beforeEach(() => AsyncStorage.clear());

function makeBackend(listSpaces: Backend["listSpaces"]): Backend {
  return { getVersion: jest.fn(), listSpaces, readPane: jest.fn(), sendLine: jest.fn(), pressKey: jest.fn() };
}

/** The list as the machine screen shows it: loaded from the backend by `useSpaces`, with the phone's order. */
function LoadedSpaceList({ backend, onOpenPane }: { backend: Backend; onOpenPane: (pane: Pane) => void }) {
  const list = useSpaces(backend);
  const spaceOrder = useSpaceOrder(MACHINE_ID, "desktop", list.spaces);
  return (
    <SpaceList
      machineId={MACHINE_ID}
      list={list}
      spaceOrder={spaceOrder}
      header={<Text>test-box</Text>}
      footer={<Text>home-server</Text>}
      onOpenPane={onOpenPane}
    />
  );
}

function renderSpaces(spaces: Space[], onOpenPane = jest.fn()) {
  render(<LoadedSpaceList backend={makeBackend(jest.fn().mockResolvedValue(spaces))} onOpenPane={onOpenPane} />);
}

function makePane(id: string, title: string, fields: Partial<Pane> = {}): Pane {
  return { id, title, agent: null, state: null, isFinished: false, columns: null, ...fields };
}

describe("SpaceList", () => {
  it("shows the error and no spinner when the first load fails", async () => {
    const backend = makeBackend(jest.fn().mockRejectedValue(new Error("Connection closed")));
    render(<LoadedSpaceList backend={backend} onOpenPane={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Could not load the list: Connection closed")).toBeTruthy());
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });

  it("shows a spinner until the first load ends", async () => {
    render(<LoadedSpaceList backend={makeBackend(jest.fn(() => new Promise(() => {})))} onOpenPane={jest.fn()} />);
    // Let the stored collapsed spaces load, as the list itself never does.
    await act(async () => {});

    expect(screen.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull();
  });

  // Herdr's spaces hold tabs, and a tab can split into several panes: the count is of tabs.
  it("shows each space with its letter badge and tab count", async () => {
    renderSpaces([
      {
        id: "s1",
        name: "api",
        tabs: [
          { id: "t1", name: "main", panes: [makePane("p1", "zsh"), makePane("p2", "sh")] },
          { id: "t3", name: "logs", panes: [makePane("p4", "tail")] },
        ],
      },
      { id: "s2", name: "~/docs", tabs: [{ id: "t2", name: "main", panes: [makePane("p3", "zsh")] }] },
    ]);

    await screen.findByText("api");
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("2 tabs")).toBeTruthy();
    expect(screen.getByText("D")).toBeTruthy();
    expect(screen.getByText("1 tab")).toBeTruthy();
  });

  it.each([
    { where: "a plain shell", pane: {}, expected: "Shell" },
    { where: "a working agent", pane: { agent: "claude", state: "working" }, expected: "Working" },
    { where: "a finished terminal", pane: { isFinished: true }, expected: "Finished" },
  ] as { where: string; pane: Partial<Pane>; expected: string }[])("shows $where with the pill $expected", async ({ pane, expected }) => {
    renderSpaces([{ id: "s1", name: "api", tabs: [{ id: "t1", name: "main", panes: [makePane("p1", "zsh", pane)] }] }]);

    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it("shows a tab with one pane as one row: the tab's name, and the pane below it", async () => {
    renderSpaces([{ id: "s1", name: "api", tabs: [{ id: "t1", name: "~", panes: [makePane("p1", "sh")] }] }]);

    expect(await screen.findByText("~")).toBeTruthy();
    expect(screen.getByText("sh")).toBeTruthy();
    // The space's row and the tab's row.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("shows the pane's name once when the tab has no name", async () => {
    renderSpaces([{ id: "s1", name: "api", tabs: [{ id: "t1", name: "", panes: [makePane("p1", "zsh")] }] }]);

    await screen.findByText("zsh");
    expect(screen.getAllByText("zsh")).toHaveLength(1);
  });

  it("names a one-pane row by the pane id when the tab and the pane have no name", async () => {
    renderSpaces([{ id: "s1", name: "api", tabs: [{ id: "t1", name: "", panes: [makePane("p9", "")] }] }]);

    expect(await screen.findByText("p9")).toBeTruthy();
  });

  it("shows no heading for a tab with no name and several panes", async () => {
    const panes = [makePane("p1", "zsh"), makePane("p2", "sh")];
    renderSpaces([{ id: "s1", name: "api", tabs: [{ id: "t1", name: "", panes }] }]);

    await screen.findByText("sh");
    expect(screen.getByText("zsh")).toBeTruthy();
    expect(screen.queryByText("", { exact: true })).toBeNull();
  });

  it("shows a tab with several panes as a heading and one row for each pane", async () => {
    const panes = [makePane("p1", "Fix the build", { agent: "claude", state: "working" }), makePane("p2", "zsh")];
    renderSpaces([{ id: "s1", name: "api", tabs: [{ id: "t1", name: "agents", panes }] }]);

    expect(await screen.findByText("agents")).toBeTruthy();
    expect(screen.getByText("claude · Fix the build")).toBeTruthy();
    expect(screen.getByText("zsh")).toBeTruthy();
    // The space's row and a row for each pane.
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("opens a pane on tap", async () => {
    const pane = makePane("t6", "zsh");
    const onOpenPane = jest.fn();
    renderSpaces([{ id: "s1", name: "api", tabs: [{ id: "t1", name: "main", panes: [pane] }] }], onOpenPane);

    fireEvent.press(await screen.findByText("zsh"));

    expect(onOpenPane).toHaveBeenCalledWith(pane);
  });

  describe("collapse", () => {
    const blocked = makePane("p1", "Fix the build", { agent: "claude", state: "blocked" });
    const api: Space = {
      id: "s1",
      name: "api",
      tabs: [
        { id: "t1", name: "agents", panes: [blocked] },
        { id: "t2", name: "logs", panes: [makePane("p2", "tail")] },
      ],
    };
    const docs: Space = { id: "s2", name: "docs", tabs: [{ id: "t3", name: "notes", panes: [makePane("p3", "vim")] }] };

    it("hides a space's tabs on a tap on its row, and shows them on a second tap", async () => {
      renderSpaces([api, docs]);

      fireEvent.press(await screen.findByText("api"));
      await waitFor(() => expect(screen.queryByText("logs")).toBeNull());
      expect(screen.getByText("notes")).toBeTruthy();

      fireEvent.press(screen.getByText("api"));
      expect(await screen.findByText("logs")).toBeTruthy();
    });

    it("keeps the badge, name, agent dot and tab count of a collapsed space, and its Needs you card", async () => {
      renderSpaces([api]);

      fireEvent.press(await screen.findByText("api"));

      await waitFor(() => expect(screen.queryByText("logs")).toBeNull());
      expect(screen.getByText("A")).toBeTruthy();
      expect(screen.getByText("2 tabs")).toBeTruthy();
      expect(screen.UNSAFE_queryByType(StateDot)).not.toBeNull();
      expect(screen.getByText("api · claude needs you")).toBeTruthy();
      expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
    });

    it("remembers a collapsed space on the phone", async () => {
      renderSpaces([api, docs]);

      fireEvent.press(await screen.findByText("api"));

      await waitFor(async () => expect(await getCollapsedSpaceIds(MACHINE_ID)).toEqual(["s1"]));
    });

    it("shows a space collapsed when the phone remembers it so", async () => {
      await saveCollapsedSpaceIds(MACHINE_ID, ["s1"]);
      renderSpaces([api, docs]);

      expect(await screen.findByText("notes")).toBeTruthy();
      await waitFor(() => expect(screen.queryByText("logs")).toBeNull());
    });

    it("forgets the spaces that no longer exist when the list loads", async () => {
      await saveCollapsedSpaceIds(MACHINE_ID, ["gone", "s1"]);
      renderSpaces([api]);

      await waitFor(async () => expect(await getCollapsedSpaceIds(MACHINE_ID)).toEqual(["s1"]));
    });
  });

  describe("Needs you", () => {
    const blocked = makePane("t13", "Fix the build", { agent: "claude", state: "blocked" });
    const working = makePane("t12", "Run the tests", { agent: "claude", state: "working" });

    function renderTab(panes: Pane[], onOpenPane = jest.fn()) {
      renderSpaces([{ id: "s1", name: "api", tabs: [{ id: "t1", name: "agents", panes }] }], onOpenPane);
    }

    it("shows a card for each blocked agent above the spaces, and keeps it in its space", async () => {
      renderTab([working, blocked]);

      await screen.findByText("api · claude needs you");
      const texts = screen.getAllByText(/./).map((node) => node.props.children);
      expect(texts.indexOf("api · claude needs you")).toBeLessThan(texts.indexOf("api"));
      expect(screen.getByText("agents · Fix the build")).toBeTruthy();
      expect(screen.getByText("Needs you")).toBeTruthy();
    });

    it("shows no card when no agent is blocked", async () => {
      renderTab([working]);

      await screen.findByText("Working");
      expect(screen.queryByText(/needs you/)).toBeNull();
    });

    it("opens the pane on a tap on its card", async () => {
      const onOpenPane = jest.fn();
      renderTab([blocked], onOpenPane);

      fireEvent.press(await screen.findByText("Answer"));

      expect(onOpenPane).toHaveBeenCalledWith(blocked);
    });
  });

  describe("order", () => {
    const api: Space = { id: "s1", name: "api", tabs: [] };
    const docs: Space = { id: "s2", name: "docs", tabs: [] };

    it("saves the order after a drag", async () => {
      renderSpaces([api, docs]);
      await screen.findByText("docs");

      act(() => screen.UNSAFE_getByType(ReorderableList).props.onReorder({ from: 1, to: 0 }));

      await waitFor(async () => expect(await getSpaceOrder(MACHINE_ID, "desktop")).toEqual(["s2", "s1"]));
    });

    it("puts a new space at the end", async () => {
      await saveSpaceOrder(MACHINE_ID, "desktop", ["s2"]);
      renderSpaces([api, docs]);

      await waitFor(async () => expect(await getSpaceOrder(MACHINE_ID, "desktop")).toEqual(["s2", "s1"]));
    });
  });

  // The list turns scrolling off for a drag. A press on a handle that never moves can miss the end.
  it("turns scrolling back on when a finger lifts from the list", async () => {
    renderSpaces([{ id: "s1", name: "api", tabs: [] }]);
    await screen.findByText("api");
    const setNativeProps = jest.spyOn(FlatList.prototype, "setNativeProps").mockImplementation(() => {});

    fireEvent(screen.UNSAFE_getByType(ReorderableList), "touchEnd");

    expect(setNativeProps).toHaveBeenCalledWith({ scrollEnabled: true });
    setNativeProps.mockRestore();
  });
});
