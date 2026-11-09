import { router } from "expo-router";
import { Alert, Button } from "react-native";

import { getErrorMessage } from "@/errorMessage";
import { useMachines } from "@/machines/MachineConnection";

/** Opens the demo machine: sample spaces and panes, with no network. */
export function TryDemoButton() {
  const { startDemo } = useMachines();

  async function openDemo() {
    try {
      await startDemo();
    } catch (error) {
      Alert.alert("Could not open the demo", getErrorMessage(error));
      return;
    }
    router.navigate("/");
  }

  return <Button title="Try the demo" onPress={() => void openDemo()} />;
}
