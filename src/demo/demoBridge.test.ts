import { readBearings } from "@/bearings/bearings";
import { parseTaskRecord } from "@/bearings/toon";
import { getAdapter } from "@/chat/adapters";
import { getPendingQuestion } from "@/claude/question";
import { findPane, getAgentGroups } from "@/herdr/agentPanes";
import { getNoteCommand, getRecordCommand, getSnapshotCommand, getTestFirstmateCommand } from "@/ssh/commands";
import { FileReadError } from "@/ssh/hostReader";

import { DEMO_NOTICE } from "./demoMachine";
import { DEMO_FIRSTMATE_FOLDER } from "./demoData";
import { makeDemoBridge } from "./demoBridge";

const bridge = makeDemoBridge("demo", () => {});

async function getPane(paneId: string) {
  const located = findPane(await bridge.backend.listSpaces(), paneId);
  if (!located) throw new Error(`No demo pane ${paneId}`);
  return located.pane;
}

/** The chat of a pane as the app reads it: the adapter locates the transcript through the host. */
async function readChat(paneId: string) {
  const pane = await getPane(paneId);
  const adapter = getAdapter(pane);
  if (!adapter) throw new Error("No adapter");
  const path = await adapter.locate(bridge.host, pane);
  if (!path) throw new Error("No transcript");
  const { text } = await bridge.host.readFile(path);
  return adapter.addLines({ chat: new Map(), orphans: new Map() }, text.split("\n").slice(0, -1), 1).chat;
}

describe("the demo machine's spaces", () => {
  it("has an agent that asks a question, one that waits on a permission, a shell and a working Firstmate", async () => {
    const groups = getAgentGroups(await bridge.backend.listSpaces());
    const states = groups.map((group) => group.state);
    expect(states).toEqual(expect.arrayContaining(["blocked", "working", "done"]));
    const shell = (await bridge.backend.listSpaces()).flatMap((space) => space.tabs.flatMap((tab) => tab.panes)).filter((pane) => pane.agent === null);
    expect(shell).toHaveLength(1);
    expect(shell[0].isShellForeground).toBe(true);
  });

  it("gives every pane a screen and reads one pane fresh", async () => {
    const spaces = await bridge.backend.listSpaces();
    for (const { id } of spaces.flatMap((space) => space.tabs.flatMap((tab) => tab.panes))) {
      expect(await bridge.backend.readPane(id)).not.toBe("");
      expect(await bridge.backend.getPane?.(id)).toMatchObject({ id });
    }
  });
});

describe("the demo chats", () => {
  it("shows a question with answer options on the first blocked agent", async () => {
    const question = getPendingQuestion(await readChat("demo-question"));
    expect(question?.options.length).toBeGreaterThan(1);
    expect(await bridge.backend.readPane("demo-question")).toContain(question?.question);
  });

  it("shows a permission prompt as a screen, with no question the app can answer", async () => {
    expect(getPendingQuestion(await readChat("demo-permission"))).toBeNull();
    expect(await bridge.backend.readPane("demo-permission")).toContain("Do you want to proceed?");
  });

  it("fails to read a file that is not there, as a host does", async () => {
    await expect(bridge.host.readFile("missing.jsonl")).rejects.toBeInstanceOf(FileReadError);
  });

  it("reads a range of lines and the line count", async () => {
    const pane = await getPane("demo-question");
    const path = await getAdapter(pane)?.locate(bridge.host, pane);
    const all = await bridge.host.readFile(path ?? "");
    const none = await bridge.host.readFile(path ?? "", { limit: 0 });
    const second = await bridge.host.readFile(path ?? "", { offset: 2, limit: 1 });
    expect(none).toMatchObject({ text: "", lines: all.lines });
    expect(second).toMatchObject({ first: 2, last: 2, text: all.text.split("\n")[1] + "\n" });
  });
});

describe("what would send", () => {
  it.each([
    { what: "a line", send: () => bridge.backend.sendLine("demo-shell", "ls") },
    { what: "a key", send: () => bridge.backend.pressKey("demo-question", "1") },
    { what: "a Bearings note", send: () => bridge.run(getNoteCommand(DEMO_FIRSTMATE_FOLDER, "r1", "hello")) },
  ])("rejects $what with the demo notice", async ({ send }) => {
    await expect(send()).rejects.toThrow(DEMO_NOTICE);
  });
});

describe("the demo Firstmate", () => {
  it("is a Firstmate home, and no other folder is", async () => {
    expect((await bridge.run(getTestFirstmateCommand(DEMO_FIRSTMATE_FOLDER))).exitCode).toBe(0);
    await expect(bridge.run(getTestFirstmateCommand("/work/acme-web"))).rejects.toThrow();
  });

  it("gives a snapshot with the sample's sections", async () => {
    const { output, exitCode } = await bridge.run(getSnapshotCommand(DEMO_FIRSTMATE_FOLDER));
    expect(exitCode).toBe(0);
    const { sections } = readBearings(output);
    expect(sections.map((section) => section.id)).toEqual(expect.arrayContaining(["decisions", "in-flight", "queued", "landed"]));
  });

  it("gives the record of a task of the snapshot", async () => {
    const { output, exitCode } = await bridge.run(getRecordCommand(DEMO_FIRSTMATE_FOLDER, "acme-api-pagination"));
    expect(exitCode).toBe(0);
    expect(parseTaskRecord(output)).toMatchObject({ id: "acme-api-pagination", state: "in_flight" });
  });

  it("fails for a command it does not know", async () => {
    await expect(bridge.run("rm -rf /")).rejects.toThrow(DEMO_NOTICE);
  });
});

describe("closing", () => {
  it("settles `closed` once, and calls `onClose`", async () => {
    const onClose = jest.fn();
    const own = makeDemoBridge("demo", onClose);
    await own.close();
    await own.close();
    await expect(own.closed).resolves.toEqual(expect.any(String));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(own.endReason).not.toBeNull();
  });
});
