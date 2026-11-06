import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { reorderItems } from "react-native-reorderable-list";

import { ForegroundContext } from "@/lock/useIsForeground";

import {
  getStoredOpenMachine,
  NO_MACHINE,
  NONE_OPEN,
  type OpenMachine,
  resolveOpenMachine,
  saveOpenMachine,
  toggleMachine,
} from "./openMachine";
import { listMachines, type Machine, moveMachine } from "./store";
import { useMachineConnection } from "./useMachineConnection";
import { type SpacesState, useSpaces } from "./useSpaces";

/** The open machine's id, its connection and its list of spaces, loaded once for every screen. */
export type MachineConnection = ReturnType<typeof useMachineConnection> & { id: string; list: SpacesState };

type MachinesState = ReturnType<typeof useMachineList>;

/** The open machine's connection, shared by the page, the Agents tab and the pane screen. Null with no machine open. */
export const MachineConnectionContext = createContext<MachineConnection | null>(null);

const MachinesContext = createContext<MachinesState | null>(null);

/** Holds the saved machines and the one open machine's connection, for every screen of the app. */
export function MachinesProvider({ children }: { children: ReactNode }) {
  const machines = useMachineList();
  const openId = machines.open?.id ?? NO_MACHINE;
  const isForeground = useContext(ForegroundContext);
  const connection = useMachineConnection(openId, isForeground);
  const backend = connection.status.phase === "connected" ? connection.status.backend : null;
  const list = useSpaces(backend);
  const value = machines.open ? { ...connection, id: openId, list } : null;

  return (
    <MachinesContext.Provider value={machines}>
      <MachineConnectionContext.Provider value={value}>{children}</MachineConnectionContext.Provider>
    </MachinesContext.Provider>
  );
}

export function useMachines(): MachinesState {
  const machines = useContext(MachinesContext);
  if (!machines) throw new Error("useMachines needs MachinesProvider around it");
  return machines;
}

/**
 * The saved machines in the person's order, and the open machine with its fold, remembered on
 * the phone. The order changes at once on a drag and is saved behind it.
 */
function useMachineList() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storedOpen, setStoredOpen] = useState<OpenMachine | null>(null);
  const open = resolveOpenMachine(machines, storedOpen);

  useEffect(() => {
    void Promise.all([listMachines(), getStoredOpenMachine()]).then(([savedMachines, savedOpen]) => {
      setMachines(savedMachines);
      setStoredOpen(savedOpen);
      setIsLoaded(true);
    });
  }, []);

  const reload = useCallback(async () => {
    setMachines(await listMachines());
  }, []);

  const saveOpen = useCallback((next: OpenMachine) => {
    setStoredOpen(next);
    void saveOpenMachine(next);
  }, []);

  const openMachine = useCallback((id: string) => saveOpen({ id, isFolded: false }), [saveOpen]);
  const closeOpen = useCallback(() => saveOpen(NONE_OPEN), [saveOpen]);

  function move(from: number, to: number) {
    setMachines((current) => reorderItems(current, from, to));
    void moveMachine(from, to);
  }

  return {
    machines,
    /** False until the saved machines have loaded, so "no machines" is told from "not yet". */
    isLoaded,
    open,
    reload,
    move,
    /** A tap on a machine's header. */
    toggle: (id: string) => saveOpen(toggleMachine(open, id)),
    openMachine,
    /** After a remove of the open machine: no machine is open, and none connects by itself. */
    closeOpen,
  };
}
