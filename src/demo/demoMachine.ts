import type { Machine } from "@/machines/store";

/** The one demo machine's id. It is a saved machine like any other; only its connection is made up. */
export const DEMO_MACHINE_ID = "demo";

export const DEMO_MACHINE: Machine = { id: DEMO_MACHINE_ID, name: "Demo machine", host: "demo.example.com", port: 22, user: "demo" };

/** What the demo shows in place of anything that would send. */
export const DEMO_NOTICE = "Demo: nothing is sent";

export function isDemoMachine(machine: Pick<Machine, "id"> | undefined): boolean {
  return machine?.id === DEMO_MACHINE_ID;
}
