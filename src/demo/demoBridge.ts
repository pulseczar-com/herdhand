import { getDemoBearings, toToon } from "@/bearings/fixtures/demo";
import type { Backend } from "@/herdr/backend";
import type { Bridge, RunCommand } from "@/ssh/bridge";
import { getRecordCommand, getSnapshotCommand, getTestFirstmateCommand } from "@/ssh/commands";
import { FileReadError, type HostReader } from "@/ssh/hostReader";

import { DEMO_FIRSTMATE_FOLDER, DEMO_FIRSTMATE_PID, DEMO_SCREENS, DEMO_SPACES, getDemoFiles } from "./demoData";
import { DEMO_NOTICE } from "./demoMachine";

const DEMO_VERSION = "demo";

/**
 * A bridge to a made-up machine, for the demo. It has the shape of a real bridge, so no screen
 * knows the difference: it reads sample spaces, chats, shells and Bearings, and anything that
 * would send fails with DEMO_NOTICE. It uses no network and no native module.
 * `onClose` runs once, when the bridge closes.
 */
export function makeDemoBridge(machineId: string, onClose: () => void): Bridge {
  let endReason: string | null = null;
  const closed = new Promise<string>(() => {});

  return {
    machineId,
    kind: "desktop",
    availableKinds: ["desktop"],
    version: DEMO_VERSION,
    backend: makeDemoBackend(),
    host: makeDemoHost(getDemoFiles()),
    run: makeDemoRun(),
    closed,
    get endReason() {
      return endReason;
    },
    close: async () => {
      if (endReason !== null) return;
      endReason = "demo closed";
      onClose();
    },
  };
}

const rejectAsDemo = () => Promise.reject(new Error(DEMO_NOTICE));

function makeDemoBackend(): Backend {
  const panes = DEMO_SPACES.flatMap((space) => space.tabs.flatMap((tab) => tab.panes));
  return {
    getVersion: async () => DEMO_VERSION,
    listSpaces: async () => DEMO_SPACES,
    readPane: async (paneId) => DEMO_SCREENS[paneId] ?? "",
    getPane: async (paneId) => {
      const pane = panes.find((candidate) => candidate.id === paneId);
      if (!pane) throw new Error(`No pane ${paneId}`);
      return pane;
    },
    sendLine: rejectAsDemo,
    pressKey: rejectAsDemo,
  };
}

/** Reads the demo's files as a host does: the line count with each read, and a missing file as a FileReadError. */
function makeDemoHost(files: Map<string, string>): HostReader {
  return {
    readFile: async (path, { offset = 1, limit = Infinity } = {}) => {
      const content = files.get(path);
      if (content === undefined) throw new FileReadError(`${path} is not a file`);
      const lines = content.split("\n").slice(0, -1);
      const read = lines.slice(offset - 1, offset - 1 + limit);
      return { text: read.map((line) => `${line}\n`).join(""), first: offset, last: offset + read.length - 1, lines: lines.length };
    },
    findFiles: async () => [],
  };
}

/** Answers the Firstmate commands of Bearings from the sample. Anything else fails with DEMO_NOTICE, so another folder is no Firstmate home. */
function makeDemoRun(): RunCommand {
  return async (command) => {
    if (command === getTestFirstmateCommand(DEMO_FIRSTMATE_FOLDER, DEMO_FIRSTMATE_PID, undefined)) return { output: "", exitCode: 0 };
    const { snapshot, records } = getDemoBearings(Date.now());
    if (command === getSnapshotCommand(DEMO_FIRSTMATE_FOLDER)) return { output: JSON.stringify(snapshot), exitCode: 0 };
    const recordId = Object.keys(records).find((id) => command === getRecordCommand(DEMO_FIRSTMATE_FOLDER, id));
    if (recordId) return { output: toToon(records[recordId]), exitCode: 0 };
    throw new Error(DEMO_NOTICE);
  };
}
