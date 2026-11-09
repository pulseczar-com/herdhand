import { Stack, useLocalSearchParams } from "expo-router";
import { useContext } from "react";

import { BearingsProvider } from "@/bearings/BearingsProvider";
import { findPane } from "@/herdr/agentPanes";
import { MachineConnectionContext } from "@/machines/MachineConnection";

/**
 * The stack of Bearings, on top of the Firstmate's pane: the list, and an item over it. It
 * holds the one snapshot and the poll that both share, so they run only while Bearings is open.
 */
export default function BearingsLayout() {
  const { id, paneId } = useLocalSearchParams<{ id: string; paneId: string }>();
  const connection = useContext(MachineConnectionContext);
  const located = connection?.id === id ? findPane(connection.list.spaces ?? [], paneId) : undefined;
  const folder = located?.pane.cwd;
  const stack = (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Bearings" }} />
      <Stack.Screen name="[section]/[itemId]" options={{ title: "" }} />
    </Stack>
  );
  if (connection?.status.phase !== "connected" || !located || !folder) return stack;

  return (
    <BearingsProvider machineId={connection.id} run={connection.status.run} folder={folder} space={located.space}>
      {stack}
    </BearingsProvider>
  );
}
