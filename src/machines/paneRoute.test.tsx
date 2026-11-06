import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, Stack } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text } from "react-native";

import TabsLayout from "../../app/(tabs)/_layout";
import AgentsScreen from "../../app/(tabs)/agents";
import SpacesScreen from "../../app/(tabs)/index";
import PaneScreen from "../../app/machine/[id]/pane/[paneId]";
import type { Backend, LineRange } from "@/herdr/backend";

import { type MachineConnection, MachinesProvider } from "./MachineConnection";
import { getStoredOpenMachine } from "./openMachine";
import { type Machine, moveMachine, removeMachine } from "./store";

const PANE_TEXT = "test-user@test-box:~$ ls\nREADME.md";

const backend: Backend = {
  getVersion: jest.fn(),
  listSpaces: jest.fn().mockResolvedValue([
    {
      id: "s1",
      name: "api",
      tabs: [
        { id: "t1", name: "main", panes: [{ id: "t6", title: "zsh", agent: null, state: null, isFinished: false, columns: null }] },
        { id: "t2", name: "agents", panes: [{ id: "t7", title: "Fix the build", agent: "claude", state: "blocked", isFinished: false, columns: null }] },
      ],
    },
  ]),
  readPane: jest.fn().mockResolvedValue(PANE_TEXT),
  sendLine: jest.fn(),
  pressKey: jest.fn(),
};

const connected: Omit<MachineConnection, "id" | "list"> = {
  status: { phase: "connected", kind: "desktop", availableKinds: ["desktop"], version: "0.1.17", backend },
  reconnect: jest.fn(),
  trust: jest.fn(),
  switchKind: jest.fn(),
  disconnect: jest.fn().mockResolvedValue(undefined),
};

const testBox: Machine = { id: "m1", name: "test-box", host: "test-box.example.com", port: 22, user: "test-user" };
const homeServer: Machine = { id: "m2", name: "home-server", host: "home-server.example.com", port: 22, user: "test-user" };

const mockOtherBackend: Backend = {
  getVersion: jest.fn(),
  listSpaces: jest.fn().mockResolvedValue([
    {
      id: "s2",
      name: "docs",
      tabs: [{ id: "t3", name: "notes", panes: [{ id: "t9", title: "vim", agent: null, state: null, isFinished: false, columns: null }] }],
    },
  ]),
  readPane: jest.fn(),
  sendLine: jest.fn(),
  pressKey: jest.fn(),
};

const mockOtherConnection: Omit<MachineConnection, "id" | "list"> = {
  ...connected,
  status: { phase: "connected", kind: "desktop", availableKinds: ["desktop"], version: "0.1.17", backend: mockOtherBackend },
};

let mockConnection = connected;
let mockSavedMachines: Machine[] = [];

// The page moves one connection between machines: each id gets its own test connection.
const mockUseMachineConnection = jest.fn();
jest.mock("./useMachineConnection", () => ({
  useMachineConnection: (id: string) => {
    mockUseMachineConnection(id);
    return id === "m2" ? mockOtherConnection : mockConnection;
  },
}));
jest.mock("./store", () => ({
  listMachines: jest.fn(async () => [...mockSavedMachines]),
  moveMachine: jest.fn(),
  removeMachine: jest.fn(async (id: string) => {
    mockSavedMachines = mockSavedMachines.filter((machine) => machine.id !== id);
  }),
}));
// The router's test library swaps in Reanimated's own mock, which lacks a hook the reorderable
// list calls, so these route tests get a plain list: they do not drag.
jest.mock("react-native-reorderable-list", () => ({
  __esModule: true,
  default: jest.requireActual("react-native").FlatList,
  useReorderableDrag: () => () => {},
  reorderItems: jest.requireActual("react-native-reorderable-list/src/utils").reorderItems,
}));

// The page remembers the open machine and collapsed spaces on the phone.
jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const mockHeaderHeight = 91;
jest.mock("expo-router/react-navigation", () => ({
  ...jest.requireActual("expo-router/react-navigation"),
  useHeaderHeight: () => mockHeaderHeight,
}));

// The first render in this file loads React Native's list modules, which can take over 5 s on a cold CI runner.
jest.setTimeout(20_000);

/** The app's routes, under the root's machines provider. */
function renderMachine(initialUrl = "/") {
  return renderRouter(
    {
      _layout: () => (
        <MachinesProvider>
          <Stack />
        </MachinesProvider>
      ),
      "(tabs)/_layout": TabsLayout,
      "(tabs)/index": SpacesScreen,
      "(tabs)/agents": AgentsScreen,
      "machine/new": () => <Text>Add a machine form</Text>,
      "machine/[id]/pane/[paneId]": PaneScreen,
    },
    { initialUrl },
  );
}

/** The page's texts in order, to check what shows above what. */
function getPageTexts(): string[] {
  return screen.UNSAFE_root.findAllByType(Text).map((node) => [node.props.children].flat().join(""));
}

beforeEach(async () => {
  mockConnection = connected;
  mockSavedMachines = [testBox];
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.mocked(backend.readPane).mockResolvedValue(PANE_TEXT);
});

// The machine's tabs and the pane screen are routes that share one connection and one list.
describe("machine routes", () => {
  it("opens a pane from the machine's list and shows its text over the same connection", async () => {
    const router = renderMachine();

    fireEvent.press(await screen.findByText("zsh"));

    expect(await screen.findByText(PANE_TEXT)).toBeTruthy();
    expect(router.getPathname()).toBe("/machine/m1/pane/t6");
    expect(backend.readPane).toHaveBeenCalledWith("t6");
  });

  it("shows the machine's row with its state, and opens its sheet with Reconnect", async () => {
    renderMachine();

    fireEvent.press(await screen.findByRole("button", { name: "test-box actions" }));
    expect(screen.getByText("test-user@test-box.example.com · Herdr App 0.1.17")).toBeTruthy();
    expect(screen.getByText("Remove machine")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.press(screen.getByText("Reconnect"));

    expect(connected.reconnect).toHaveBeenCalled();
  });

  it("closes the connection when the open machine is removed, and shows the page without it", async () => {
    const alert = jest.spyOn(Alert, "alert");
    renderMachine();
    fireEvent.press(await screen.findByRole("button", { name: "test-box actions" }));
    fireEvent.press(screen.getByText("Remove machine"));

    const removeButton = alert.mock.calls[0][2]?.find((button) => button.text === "Remove");
    await act(async () => removeButton?.onPress?.());

    expect(connected.disconnect).toHaveBeenCalled();
    expect(removeMachine).toHaveBeenCalledWith("m1");
    expect(await screen.findByText(/Tap \+ to add a machine/)).toBeTruthy();
  });

  it("offers the other Herdr kind in the sheet when the machine runs both", async () => {
    mockConnection = { ...connected, status: { ...connected.status, availableKinds: ["desktop", "tui"] } as typeof connected.status };
    renderMachine();

    fireEvent.press(await screen.findByRole("button", { name: "test-box actions" }));
    fireEvent.press(screen.getByRole("radio", { name: "Herdr TUI" }));

    expect(connected.switchKind).toHaveBeenCalledWith("tui");
  });

  it("shows the error with Reconnect when the connection failed", async () => {
    mockConnection = { ...connected, status: { phase: "failed", message: "The connection closed." } };
    renderMachine();

    expect(await screen.findByText("Not connected")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Reconnect" }));

    expect(connected.reconnect).toHaveBeenCalled();
  });

  it("counts blocked agents on the Agents tab, which lists them by state and opens them", async () => {
    const router = renderMachine();

    fireEvent.press(await screen.findByText("Agents · 1"));
    expect(await screen.findByText("api · claude")).toBeTruthy();
    expect(screen.getByText("Needs you")).toBeTruthy();
    fireEvent.press(screen.getByText("api · claude"));

    expect(await screen.findByText(PANE_TEXT)).toBeTruthy();
    expect(router.getPathname()).toBe("/machine/m1/pane/t7");
  });

  it("opens Add a machine from + on the header, with no back arrow on the page", async () => {
    renderMachine();

    fireEvent.press(await screen.findByLabelText("Add a machine"));

    expect(await screen.findByText("Add a machine form")).toBeTruthy();
    act(() => router.back());
    expect(await screen.findByText("zsh")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
  });

  it("shows a spinner on the Agents tab until the first load ends", async () => {
    jest.mocked(backend.listSpaces).mockReturnValueOnce(new Promise(() => {}));
    renderMachine();

    await screen.findByText("Agents");
    const spinnersBefore = screen.UNSAFE_queryAllByType(ActivityIndicator).length;
    fireEvent.press(screen.getByText("Agents"));

    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(spinnersBefore + 1);
    expect(screen.queryByText("No agents are running.")).toBeNull();
  });

  it("says no agents are running on the Agents tab once the list has loaded with none", async () => {
    jest.mocked(backend.listSpaces).mockResolvedValueOnce([]);
    renderMachine();

    fireEvent.press(await screen.findByText("Agents"));

    expect(await screen.findByText("No agents are running.")).toBeTruthy();
  });

  it("loads the list once on open, and again when the person comes back from a pane", async () => {
    renderMachine();

    fireEvent.press(await screen.findByText("zsh"));
    await screen.findByText(PANE_TEXT);
    expect(backend.listSpaces).toHaveBeenCalledTimes(1);
    act(() => router.back());

    await waitFor(() => expect(backend.listSpaces).toHaveBeenCalledTimes(2));
  });

  it("shows the pane's space, place and state in its header", async () => {
    renderMachine();

    fireEvent.press(await screen.findByText("Answer"));

    expect(await screen.findByText(PANE_TEXT)).toBeTruthy();
    expect(screen.getByText("agents · Fix the build")).toBeTruthy();
    expect(screen.getByText("Needs you")).toBeTruthy();
  });

  it("shows the pane's text reformatted, with no Raw switch", async () => {
    jest.mocked(backend.readPane).mockResolvedValueOnce("test-user@test-box:~$ make\n--------\nBuild done");
    renderMachine("/machine/m1/pane/t6");

    expect(await screen.findByText("Build done")).toBeTruthy();
    expect(screen.queryByText(/--------/)).toBeNull();
    expect(screen.queryByRole("switch", { name: "Raw" })).toBeNull();
  });

  it.each([
    { what: "a shell", path: "/machine/m1/pane/t6", placeholder: "Run a command" },
    { what: "an agent pane", path: "/machine/m1/pane/t7", placeholder: "Message the agent" },
  ])("names where input goes on $what", async ({ path, placeholder }) => {
    renderMachine(path);

    expect(await screen.findByPlaceholderText(placeholder)).toBeTruthy();
  });

  it("shows a TUI pane's text with its style codes removed", async () => {
    jest.mocked(backend.readPane).mockResolvedValueOnce('test-user@test-box:~$ \x1b[0m\x1b[2mTry "ls"\x1b[0m\x1b[38;2;136;136;136m!\x1b[0m');
    renderMachine("/machine/m1/pane/t6");

    expect(await screen.findByText(/Try "ls"/)).toBeTruthy();
    expect(screen.queryByText(/\x1b|\[0m|\[2m/)).toBeNull();
  });

  it("shows that it is reconnecting, not an error, while the connection comes back", async () => {
    mockConnection = { ...connected, status: { phase: "connecting" } };
    renderMachine("/machine/m1/pane/t6");

    expect(await screen.findByText("Reconnecting…")).toBeTruthy();
    expect(screen.queryByText("The connection closed.")).toBeNull();
  });
});

// One page: every machine is a header, and the open machine's spaces fold under it.
describe("the page of machines", () => {
  beforeEach(() => {
    mockSavedMachines = [testBox, homeServer];
  });

  it("shows every machine as a header, the first one open with its spaces, and the others not connected", async () => {
    renderMachine();

    expect(await screen.findByText("zsh")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("home-server")).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.queryByText("docs")).toBeNull();
  });

  it("shows the Needs you cards above the machine headers", async () => {
    renderMachine();

    await screen.findByText("api · claude needs you");

    const texts = getPageTexts();
    expect(texts.indexOf("api · claude needs you")).toBeLessThan(texts.indexOf("test-box"));
  });

  it("folds the open machine on a tap on its header, keeps it connected, and remembers it", async () => {
    renderMachine();

    fireEvent.press(await screen.findByText("test-box"));

    await waitFor(() => expect(screen.queryByText("zsh")).toBeNull());
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(await getStoredOpenMachine()).toEqual({ id: "m1", isFolded: true });
    fireEvent.press(screen.getByText("test-box"));
    expect(await screen.findByText("zsh")).toBeTruthy();
  });

  it("connects another machine on a tap on its header, and folds the one that was open", async () => {
    renderMachine();
    await screen.findByText("zsh");

    fireEvent.press(screen.getByText("home-server"));

    expect(await screen.findByText("docs")).toBeTruthy();
    expect(screen.queryByText("zsh")).toBeNull();
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(await getStoredOpenMachine()).toEqual({ id: "m2", isFolded: false });
  });

  it("opens the machine that was open last time, folded as it was left", async () => {
    await AsyncStorage.setItem("machines.open", JSON.stringify({ id: "m2", isFolded: true }));
    renderMachine();

    expect(await screen.findByText("Connected")).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
    const texts = getPageTexts();
    expect(texts.indexOf("test-box")).toBeLessThan(texts.indexOf("Not connected"));
    expect(texts.indexOf("home-server")).toBeLessThan(texts.indexOf("Connected"));
    expect(texts.indexOf("Not connected")).toBeLessThan(texts.indexOf("home-server"));
    expect(screen.queryByText("docs")).toBeNull();
  });

  it("opens no machine after the open machine is removed, until a tap on a header", async () => {
    const alert = jest.spyOn(Alert, "alert");
    renderMachine();
    await screen.findByText("zsh");
    fireEvent.press(screen.getByRole("button", { name: "test-box actions" }));
    fireEvent.press(screen.getByText("Remove machine"));
    const removeButton = alert.mock.calls[0][2]?.find((button) => button.text === "Remove");
    await act(async () => removeButton?.onPress?.());

    expect(await screen.findByText("Not connected")).toBeTruthy();
    expect(screen.getByText("home-server")).toBeTruthy();
    expect(screen.queryByText("docs")).toBeNull();
    expect(mockUseMachineConnection).not.toHaveBeenCalledWith("m2");

    fireEvent.press(screen.getByText("home-server"));
    expect(await screen.findByText("docs")).toBeTruthy();
  });

  it("opens a machine that is not open from Reconnect in its sheet", async () => {
    renderMachine();
    await screen.findByText("zsh");

    fireEvent.press(screen.getByRole("button", { name: "home-server actions" }));
    expect(screen.getByText("test-user@home-server.example.com")).toBeTruthy();
    fireEvent.press(screen.getByText("Reconnect"));

    expect(await screen.findByText("docs")).toBeTruthy();
  });

  it("opens a link's own machine first when the link names a machine that is not open", async () => {
    jest.mocked(mockOtherBackend.readPane).mockResolvedValue("vim text");
    renderMachine("/machine/m2/pane/t9");

    expect(await screen.findByText("vim text")).toBeTruthy();
    expect(await getStoredOpenMachine()).toEqual({ id: "m2", isFolded: false });
    expect(backend.readPane).not.toHaveBeenCalled();
  });

  it("never shows the open machine's pane for a link that names another machine", async () => {
    renderMachine("/machine/m2/pane/t6");

    await waitFor(async () => expect(await getStoredOpenMachine()).toEqual({ id: "m2", isFolded: false }));
    expect(screen.queryByText(PANE_TEXT)).toBeNull();
    expect(backend.readPane).not.toHaveBeenCalled();
  });

  it("says so for a link to a machine that is no longer on the phone", async () => {
    renderMachine("/machine/m9/pane/t6");

    expect(await screen.findByText("This machine is no longer on this phone.")).toBeTruthy();
    expect(backend.readPane).not.toHaveBeenCalled();
  });

  it("says so for a link when no machine is saved on the phone", async () => {
    mockSavedMachines = [];
    renderMachine("/machine/m1/pane/t6");

    expect(await screen.findByText("This machine is no longer on this phone.")).toBeTruthy();
  });

  it("drags the machines to reorder them, saves the order, and shows the handle on every header", async () => {
    renderMachine();
    expect(await screen.findByLabelText("Drag test-box")).toBeTruthy();
    expect(screen.getByLabelText("Drag home-server")).toBeTruthy();

    fireEvent.press(screen.getByText("test-box"));
    expect(await screen.findByLabelText("Drag test-box")).toBeTruthy();
    const [machineList] = screen.UNSAFE_root.findAll((node) => typeof node.props.onReorder === "function");
    act(() => machineList.props.onReorder({ from: 1, to: 0 }));

    expect(moveMachine).toHaveBeenCalledWith(1, 0);
    const texts = getPageTexts();
    expect(texts.indexOf("home-server")).toBeLessThan(texts.indexOf("test-box"));
  });

  it("folds every machine while a machine is dragged, and brings the open one back at the drop", async () => {
    renderMachine();
    await screen.findByText("zsh");

    fireEvent(screen.getByLabelText("Drag test-box"), "pressIn");
    await waitFor(() => expect(screen.queryByText("zsh")).toBeNull());
    expect(screen.getByLabelText("Drag home-server")).toBeTruthy();
    const [machineList] = screen.UNSAFE_root.findAll((node) => typeof node.props.onDragEnd === "function");
    act(() => machineList.props.onDragEnd());

    expect(await screen.findByText("zsh")).toBeTruthy();
  });

  it("brings the page back on a tap on a header when a touch on a handle did not become a drag", async () => {
    renderMachine();
    await screen.findByText("zsh");

    fireEvent(screen.getByLabelText("Drag test-box"), "pressIn");
    await waitFor(() => expect(screen.queryByText("zsh")).toBeNull());
    fireEvent.press(screen.getByText("test-box"));

    expect(await screen.findByText("zsh")).toBeTruthy();
  });

  it("draws a divider above every machine header but the first", async () => {
    renderMachine();
    await screen.findByText("zsh");

    // The tab bar has a top border too; only a machine header is a row with a gap of 10.
    const dividers = screen.UNSAFE_root.findAll((node) => {
      const style = typeof node.type === "string" ? StyleSheet.flatten(node.props.style) : undefined;
      return Boolean(style?.borderTopWidth) && style?.gap === 10;
    });

    expect(dividers).toHaveLength(1);
    expect(within(dividers[0]).queryByText("home-server")).toBeTruthy();
    expect(within(dividers[0]).queryByText("test-box")).toBeNull();
  });
});

describe("Claude chat", () => {
  const claudePane = { id: "t8", title: "Fix the build", agent: "claude-code", state: "blocked" as const, isFinished: false, columns: null, pid: 100 };
  const files: Record<string, string> = {
    ".claude/sessions/100.json": JSON.stringify({ pid: 100, sessionId: "s-1", cwd: "/work/demo" }),
    ".claude/projects/-work-demo/s-1.jsonl": `${JSON.stringify({ type: "user", uuid: "u1", message: { content: "Run the tests" } })}
`,
  };
  const chatBackend: Backend = {
    ...backend,
    listSpaces: jest.fn().mockResolvedValue([{ id: "s1", name: "api", tabs: [{ id: "t2", name: "agents", panes: [claudePane] }] }]),
    getPane: jest.fn().mockResolvedValue({ ...claudePane, message: "approve Bash: npm test" }),
    readFile: jest.fn(async (path: string, range?: LineRange) =>
      range?.limit === 0 ? { text: "", first: 1, last: 0, lines: 1 } : { text: files[path], first: 1, last: 1, lines: 1 },
    ),
  };

  function connectTo(chosen: Backend) {
    mockConnection = { ...connected, status: { phase: "connected", kind: "desktop", availableKinds: ["desktop"], version: "0.1.18", backend: chosen } };
  }

  it("opens a Claude pane on its chat, with Claude's message while it is blocked", async () => {
    connectTo(chatBackend);
    renderMachine("/machine/m1/pane/t8");

    expect(await screen.findByText("Run the tests")).toBeTruthy();
    expect(screen.getByText("approve Bash: npm test")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Chat", selected: true })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Raw" })).toBeNull();
  });

  it("shows the pane's screen, one tap away", async () => {
    connectTo(chatBackend);
    renderMachine("/machine/m1/pane/t8");
    await screen.findByText("Run the tests");

    fireEvent.press(screen.getByRole("tab", { name: "Screen" }));

    expect(await screen.findByText(PANE_TEXT)).toBeTruthy();
    expect(screen.queryByText("Run the tests")).toBeNull();
  });

  it("hides Claude's suggested message in its input box on the screen", async () => {
    const rule = "─".repeat(20);
    jest.mocked(backend.readPane).mockResolvedValue(`● Done.\n${rule}\n❯ merge the branch\n${rule}`);
    connectTo(chatBackend);
    renderMachine("/machine/m1/pane/t8");
    await screen.findByText("Run the tests");

    fireEvent.press(screen.getByRole("tab", { name: "Screen" }));

    expect(await screen.findByText("❯")).toBeTruthy();
    expect(screen.queryByText(/merge the branch/)).toBeNull();
  });

  it("shows only the screen when Herdr cannot read files, as on the TUI", async () => {
    connectTo({ ...chatBackend, getPane: undefined, readFile: undefined });
    renderMachine("/machine/m1/pane/t8");

    expect(await screen.findByText(PANE_TEXT)).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Chat" })).toBeNull();
  });
});

// Expo's keyboard guide: Android apps are edge-to-edge, so the window does not resize for the
// keyboard; "padding" usually works best, and under a header the offset is the header's height.
describe("pane screen keyboard", () => {
  it("pads the view by the keyboard, below the header", async () => {
    renderMachine("/machine/m1/pane/t6");
    await screen.findByText(PANE_TEXT);

    const view = screen.UNSAFE_getByType(KeyboardAvoidingView);

    expect(view.props.behavior).toBe("padding");
    expect(view.props.keyboardVerticalOffset).toBe(mockHeaderHeight);
  });
});

// A scroll event as Android sends it: where the view is, how tall the text is, how tall the view is.
function makeScrollEvent(offsetY: number) {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y: offsetY },
      contentSize: { width: 400, height: 2000 },
      layoutMeasurement: { width: 400, height: 600 },
    },
  };
}

describe("pane text scroll", () => {
  function getPaneScrollView() {
    return screen.UNSAFE_queryAllByType(ScrollView).find((view) => view.props.testID === "pane-text");
  }

  // The scroll command waits one frame; renderRouter uses fake timers, so a frame runs when time moves on.
  const FRAME_MS = 16;
  const flushFrames = () => act(() => jest.advanceTimersByTime(FRAME_MS));

  async function openPane() {
    renderMachine("/machine/m1/pane/t6");
    await screen.findByText(PANE_TEXT);
    flushFrames();
    const scrollView = getPaneScrollView();
    jest.mocked(scrollView?.instance.scrollToEnd).mockClear();
    return scrollView!;
  }

  // Android runs scrollToEnd with the content height the view has at that moment, which can be
  // before the new text is mounted. An empty scroll view then scrolls to the top.
  it("shows no scroll view until the first text arrives", async () => {
    jest.mocked(backend.readPane).mockReturnValueOnce(new Promise(() => {}));
    renderMachine("/machine/m1/pane/t6");

    await screen.findByText("api");
    expect(getPaneScrollView()).toBeUndefined();
  });

  it("keeps following the end when a scroll it did not make lands short of it", async () => {
    const scrollView = await openPane();

    act(() => scrollView.props.onScroll?.(makeScrollEvent(0)));
    act(() => scrollView.props.onContentSizeChange?.(400, 2100));
    flushFrames();

    expect(scrollView.instance.scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  // The same race as the first open: a command sent in the size change callback can run before
  // the new text is mounted and scroll to the old end.
  it("sends the scroll command after the frame that mounts the new text, not in the size change", async () => {
    const scrollView = await openPane();

    act(() => scrollView.props.onContentSizeChange?.(400, 2100));
    expect(scrollView.instance.scrollToEnd).not.toHaveBeenCalled();
    flushFrames();

    expect(scrollView.instance.scrollToEnd).toHaveBeenCalledTimes(1);
  });

  // The keyboard makes the view shorter; the last lines would go below it.
  it("stays at the end when the view gets shorter", async () => {
    const scrollView = await openPane();

    act(() => scrollView.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 300 } } }));
    flushFrames();

    expect(scrollView.instance.scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  it("stops following when the person scrolls up, and follows again back at the end", async () => {
    const scrollView = await openPane();

    act(() => scrollView.props.onScrollEndDrag?.(makeScrollEvent(0)));
    act(() => scrollView.props.onContentSizeChange?.(400, 2100));
    flushFrames();
    expect(scrollView.instance.scrollToEnd).not.toHaveBeenCalled();

    act(() => scrollView.props.onMomentumScrollEnd?.(makeScrollEvent(1400)));
    act(() => scrollView.props.onContentSizeChange?.(400, 2200));
    flushFrames();
    expect(scrollView.instance.scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });
});
