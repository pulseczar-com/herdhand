import { useTheme } from "expo-router";
import { StyleSheet, Text } from "react-native";

/** Shown while the machine is not connected, or when the pane is not a Firstmate's. */
export function NotReady() {
  const { colors } = useTheme();
  return <Text style={[styles.message, { color: colors.text }]}>Bearings needs an open connection to the Firstmate's pane.</Text>;
}

const styles = StyleSheet.create({
  message: { fontSize: 15, padding: 16 },
});
