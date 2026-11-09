import { router } from "expo-router";
import { Button } from "react-native";

import { useMachines } from "@/machines/MachineConnection";

/** Opens the demo machine: sample spaces and panes, with no network. */
export function TryDemoButton() {
  const { startDemo } = useMachines();
  return <Button title="Try the demo" onPress={() => void startDemo().then(() => router.navigate("/"))} />;
}
