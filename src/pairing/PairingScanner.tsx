import * as Application from "expo-application";
import { type BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import { useTheme } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { type PairingCode, parsePairingCode } from "./code";
import { makePairCommand } from "./command";

type PairingScannerProps = {
  visible: boolean;
  onScanned: (code: PairingCode) => void;
  onClose: () => void;
};

const PAIR_COMMAND = makePairCommand(Application.nativeApplicationVersion);

/**
 * Shows the command to run on the machine and the camera to scan the code it prints. A code it
 * cannot read keeps it open, with the reason.
 */
export function PairingScanner({ visible, onScanned, onClose }: PairingScannerProps) {
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  // The camera reports the same code many times a second; each one is read once.
  const lastRead = useRef<string | null>(null);

  function read({ data }: BarcodeScanningResult) {
    if (data === lastRead.current) return;
    lastRead.current = data;
    const parsed = parsePairingCode(data);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    close();
    onScanned(parsed);
  }

  function close() {
    lastRead.current = null;
    setError(null);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Scan pairing code</Text>
        <Text style={[styles.text, { color: colors.text }]}>1. On the machine, run this command in a terminal:</Text>
        <Text selectable style={[styles.command, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}>
          {PAIR_COMMAND}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: PAIR_COMMAND })}>
          <Text style={[styles.link, { color: colors.primary }]}>Share the command</Text>
        </Pressable>
        <Text style={[styles.text, { color: colors.text }]}>2. Point the camera at the code it shows.</Text>
        {visible ? <Camera onRead={read} /> : null}
        {error ? <Text style={[styles.text, { color: colors.notification }]}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={close}>
          <Text style={[styles.link, { color: colors.primary }]}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

/** The camera once the person allows it, or the way to allow it. */
function Camera({ onRead }: { onRead: (result: BarcodeScanningResult) => void }) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return null;
  if (permission.granted) {
    return (
      <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onRead} />
    );
  }
  if (permission.canAskAgain) {
    return (
      <Pressable accessibilityRole="button" onPress={() => void requestPermission()}>
        <Text style={[styles.link, { color: colors.primary }]}>Allow the camera</Text>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
      <Text style={[styles.text, { color: colors.text }]}>Herdhand cannot use the camera.</Text>
      <Text style={[styles.link, { color: colors.primary }]}>Allow it in Android settings</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: "600" },
  text: { fontSize: 15 },
  command: { fontFamily: "monospace", fontSize: 13, borderWidth: 1, borderRadius: 10, padding: 12 },
  link: { fontSize: 16, paddingVertical: 4 },
  camera: { width: "100%", aspectRatio: 1, borderRadius: 12, overflow: "hidden" },
});
