import AsyncStorage from "@react-native-async-storage/async-storage";
import { router as appRouter, Stack } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Alert, Linking, Text } from "react-native";

import BearingsLayout from "../../app/machine/[id]/pane/[paneId]/bearings/_layout";
import BearingsIndex from "../../app/machine/[id]/pane/[paneId]/bearings/index";
import ItemRoute from "../../app/machine/[id]/pane/[paneId]/bearings/[section]/[itemId]";
import PaneScreen from "../../app/machine/[id]/pane/[paneId]";
import type { Backend } from "@/herdr/backend";
import { type MachineConnection, MachinesProvider } from "@/machines/MachineConnection";
import type { Machine } from "@/machines/store";
import type { HostReader } from "@/ssh/hostReader";

import { getDemoBearings, toToon } from "./fixtures/demo";
import { resetLastSeen } from "./lastSeen";
import { resetFirstmateChecks } from "./useIsFirstmate";

const FIRSTMATE_FOLDER = "/srv/crew";
const demo = getDemoBearings(Date.now());

const backend: Backend = {
  getVersion: jest.fn(),
  listSpaces: jest.fn().mockResolvedValue([
    {
      id: "s1",
      name: "crew",
      tabs: [
        {
          id: "t1",
          name: "main",
          panes: [
            { id: "t6", title: "zsh", agent: null, state: null, isFinished: false, columns: null, cwd: FIRSTMATE_FOLDER },
            { id: "t7", title: "zsh", agent: null, state: null, isFinished: false, columns: null, cwd: "/srv/other" },
          ],
        },
      ],
    },
  ]),
  readPane: jest.fn().mockResolvedValue("$ ls"),
  sendLine: jest.fn(),
  pressKey: jest.fn(),
};

const noFiles: HostReader = { readFile: jest.fn(), findFiles: jest.fn().mockResolvedValue([]) };

/** The commands the app ran, and what the fake machine answers to each. */
const commands: string[] = [];
const run = jest.fn(async (command: string) => {
  commands.push(command);
  if (command.includes("test -x")) return { output: "", exitCode: command.includes(FIRSTMATE_FOLDER) ? 0 : 1 };
  if (command.includes("fm-bearings-snapshot.sh\" --json")) return { output: JSON.stringify(demo.snapshot), exitCode: 0 };
  if (command.includes("fm-tasks-axi.sh")) {
    const id = / '[^']*' '([^']*)'$/.exec(command)?.[1] ?? "";
    return { output: toToon(demo.records[id] ?? {}), exitCode: 0 };
  }
  return { output: "", exitCode: 0 };
});

const mockConnection: Omit<MachineConnection, "id" | "list"> = {
  status: { phase: "connected", kind: "desktop", availableKinds: ["desktop"], version: "0.1.17", backend, host: noFiles, run },
  reconnect: jest.fn(),
  trust: jest.fn(),
  switchKind: jest.fn(),
  disconnect: jest.fn().mockResolvedValue(undefined),
};

const mockTestBox: Machine = { id: "m1", name: "test-box", host: "test-box.example.com", port: 22, user: "test-user" };

jest.mock("@/machines/useMachineConnection", () => ({ useMachineConnection: () => mockConnection }));
jest.mock("@/machines/store", () => ({ listMachines: jest.fn(async () => [mockTestBox]), moveMachine: jest.fn(), removeMachine: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-router/react-navigation", () => ({
  ...jest.requireActual("expo-router/react-navigation"),
  useHeaderHeight: () => 91,
}));

jest.setTimeout(20_000);

function renderPane(paneId: string) {
  return renderRouter(
    {
      _layout: () => (
        <MachinesProvider>
          <Stack>
            <Stack.Screen name="machine/[id]/pane/[paneId]/bearings" options={{ headerShown: false }} />
          </Stack>
        </MachinesProvider>
      ),
      index: () => <Text>Start</Text>,
      "machine/[id]/pane/[paneId]/index": PaneScreen,
      "machine/[id]/pane/[paneId]/bearings/_layout": BearingsLayout,
      "machine/[id]/pane/[paneId]/bearings/index": BearingsIndex,
      "machine/[id]/pane/[paneId]/bearings/[section]/[itemId]": ItemRoute,
    },
    { initialUrl: `/machine/m1/pane/${paneId}` },
  );
}

beforeEach(async () => {
  commands.length = 0;
  resetFirstmateChecks();
  resetLastSeen();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe("a Firstmate pane", () => {
  it("has a Bearings button, and a pane in another folder has none", async () => {
    renderPane("t7");
    await screen.findByText("$ ls");
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Bearings" })).toBeNull();
  });

  it("runs no Firstmate command until the Bearings button is tapped", async () => {
    renderPane("t6");
    await screen.findByRole("button", { name: "Bearings" });

    expect(commands.filter((command) => command.includes("fm-bearings-snapshot.sh\" --json"))).toEqual([]);

    fireEvent.press(screen.getByRole("button", { name: "Bearings" }));
    await screen.findByText("Waiting on you");

    expect(commands.filter((command) => command.includes("fm-bearings-snapshot.sh\" --json"))).toHaveLength(1);
  });
});

describe("Bearings", () => {
  async function openBearings() {
    const router = renderPane("t6");
    fireEvent.press(await screen.findByRole("button", { name: "Bearings" }));
    await screen.findByText("Waiting on you");
    return router;
  }

  it("shows the sections with their counts, and a card with its status and PR chip", async () => {
    await openBearings();

    expect(screen.getByRole("button", { name: "Waiting on you, 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "In flight, 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "PRs, 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Queued, 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Landed, 4" })).toBeTruthy();
    expect(screen.queryByText("Secondmates")).toBeNull();
    expect(screen.getByText("crew · Bearings")).toBeTruthy();
    expect(screen.getByText(/^Updated \d+ s ago · pull to refresh$/)).toBeTruthy();
    // The task is in flight and has a PR: the first card is the task's.
    const [card] = screen.getAllByRole("button", { name: "Add cursor pagination to the orders endpoint" });
    expect(within(card).getByText("working")).toBeTruthy();
    expect(within(card).getByText("acme-api")).toBeTruthy();
    // The PR row has no repo of its own: its card shows the one from the PR URL.
    const [, prCard] = screen.getAllByRole("button", { name: "Add cursor pagination to the orders endpoint" });
    expect(within(prCard).getByText("acme-api")).toBeTruthy();
  });

  it("folds a section with a tap on its title", async () => {
    await openBearings();

    fireEvent.press(screen.getByRole("button", { name: "Landed, 4" }));

    expect(screen.queryByText("Add a health check endpoint")).toBeNull();
    expect(screen.getByText("Waiting on you")).toBeTruthy();
  });

  it("opens an item with a tap, shows all its data, and goes back to the list", async () => {
    const router = await openBearings();

    fireEvent.press(screen.getAllByRole("button", { name: "Add cursor pagination to the orders endpoint" })[0]);

    expect(await screen.findByText(/The orders endpoint returns every order at once/)).toBeTruthy();
    expect(router.getPathname()).toBe("/machine/m1/pane/t6/bearings/in-flight/acme-api-pagination");
    expect(screen.getByText("DESCRIPTION")).toBeTruthy();
    expect(screen.getByText("DOING")).toBeTruthy();
    expect(screen.getByText("In flight · acme-api")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();

    act(() => appRouter.back());
    expect(await screen.findByText("Waiting on you")).toBeTruthy();
    expect(router.getPathname()).toBe("/machine/m1/pane/t6/bearings");
  });

  it("shows the last data at once when Bearings opens again, and an item shows its record at once", async () => {
    await openBearings();
    fireEvent.press(screen.getAllByRole("button", { name: "Add cursor pagination to the orders endpoint" })[0]);
    await screen.findByText(/The orders endpoint returns every order at once/);
    act(() => appRouter.back());
    await screen.findByText("Waiting on you");
    act(() => appRouter.back());
    await screen.findByRole("button", { name: "Bearings" });

    fireEvent.press(screen.getByRole("button", { name: "Bearings" }));

    // No wait: the list and its age come from the earlier visit.
    expect(screen.getByText("Waiting on you")).toBeTruthy();
    expect(screen.getByText(/^Updated \d+ s ago/)).toBeTruthy();
    fireEvent.press(screen.getAllByRole("button", { name: "Add cursor pagination to the orders endpoint" })[0]);
    expect(screen.getByText(/The orders endpoint returns every order at once/)).toBeTruthy();
  });

  it("opens the PR in the browser from its chip", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await openBearings();
    const [, prCard] = screen.getAllByRole("button", { name: "Add cursor pagination to the orders endpoint" });

    fireEvent.press(within(prCard).getByRole("link", { name: "PR #58" }));

    expect(openURL).toHaveBeenCalledWith("https://github.com/example/acme-api/pull/58");
  });
});

describe("an opened item", () => {
  async function openItem(title: string) {
    renderPane("t6");
    fireEvent.press(await screen.findByRole("button", { name: "Bearings" }));
    await screen.findByText("Waiting on you");
    fireEvent.press(screen.getAllByRole("button", { name: title })[0]);
  }

  it.each([
    ["a decision", "Search empty state wording", ["Discuss", "Defer", "Drop"]],
    ["a working task", "Add cursor pagination to the orders endpoint", ["Discuss", "Stop"]],
    ["a free queued item", "Add a dark mode toggle", ["Discuss", "Start now"]],
    ["a landed item", "Show clear errors on the login form", ["Discuss"]],
  ])("shows the buttons its row allows for %s", async (_name, title, expected) => {
    await openItem(title);
    await screen.findByText("Discuss");

    const names = expected.filter((name) => screen.queryByRole("button", { name }));
    expect(names).toEqual(expected);
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("sends the action note at once for Defer, and refreshes the list", async () => {
    await openItem("Search empty state wording");
    await screen.findByText("Discuss");
    const snapshots = () => commands.filter((command) => command.includes("fm-bearings-snapshot.sh\" --json")).length;
    const before = snapshots();

    fireEvent.press(screen.getByRole("button", { name: "Defer" }));

    expect(await screen.findByText("Sent to crew.")).toBeTruthy();
    const note = commands.find((command) => command.includes("fm-inbox.sh"));
    expect(note).toContain("'[bearings panel] defer decisions acme-web-empty-search'");
    expect(note).toContain("/srv/crew");
    await waitFor(() => expect(snapshots()).toBe(before + 1));
  });

  it("asks before Drop and Stop, and sends nothing on Cancel", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await openItem("Search empty state wording");
    await screen.findByText("Discuss");

    fireEvent.press(screen.getByRole("button", { name: "Drop" }));

    expect(alert.mock.calls[0][0]).toBe("Drop this item?");
    expect(commands.some((command) => command.includes("fm-inbox.sh"))).toBe(false);
    const drop = alert.mock.calls[0][2]?.find((button) => button.text === "Drop");
    drop?.onPress?.();
    await waitFor(() => expect(commands.some((command) => command.includes("[bearings panel] drop decisions acme-web-empty-search"))).toBe(true));
  });

  it("sends a Discuss note typed in the sheet", async () => {
    await openItem("Add a dark mode toggle");
    fireEvent.press(await screen.findByRole("button", { name: "Discuss" }));

    fireEvent.changeText(screen.getByLabelText("Note"), "start   with\nthe header");
    fireEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Note sent to crew.")).toBeTruthy();
    const note = commands.find((command) => command.includes("fm-inbox.sh"));
    expect(note).toContain("'[bearings panel] discuss queued acme-web-dark-mode - start with the header'");
  });

  it("keeps the sheet open and shows the error when the note fails", async () => {
    await openItem("Add a dark mode toggle");
    fireEvent.press(await screen.findByRole("button", { name: "Discuss" }));
    run.mockImplementationOnce(async () => ({ output: "", exitCode: 4 }));

    fireEvent.changeText(screen.getByLabelText("Note"), "hello");
    fireEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Could not send (exit 4)")).toBeTruthy();
    expect(screen.getByLabelText("Note")).toBeTruthy();
  });
});
