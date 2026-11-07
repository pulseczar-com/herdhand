import * as Application from "expo-application";
import { useTheme } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { RELOCK_AFTER_MS } from "@/lock/appLock";
import { getAppLockEnabled, saveAppLockEnabled } from "@/settings/store";

const REPOSITORY_URL = "https://github.com/pulseczar-com/herdhand";
const MS_PER_MINUTE = 60_000;
const RELOCK_AFTER_MINUTES = RELOCK_AFTER_MS / MS_PER_MINUTE;
const APP_ICON = require("../assets/icon.png");
// Each cut is drawn for its own ground: light text on dark, dark text on light.
const DARK_LOCKUP = require("../assets/pulseczar-lockup-dark.png");
const LIGHT_LOCKUP = require("../assets/pulseczar-lockup-light.png");

/** Settings: the app lock, and About. */
export default function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <AppLockSection />
      <AboutSection />
    </ScrollView>
  );
}

/** The app lock switch, and when it asks again. */
function AppLockSection() {
  const { colors } = useTheme();
  // Null until the saved setting loads; the switch waits for it.
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    void getAppLockEnabled().then(setIsEnabled);
  }, []);

  function saveIsEnabled(value: boolean) {
    setIsEnabled(value);
    void saveAppLockEnabled(value);
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.primary }]}>Security</Text>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>App lock</Text>
          <Text style={[styles.rowDetail, { color: colors.text }]}>
            Ask for your fingerprint, face or screen lock when Herdhand opens, and after {RELOCK_AFTER_MINUTES} minutes in
            the background.
          </Text>
        </View>
        <Switch accessibilityLabel="App lock" value={isEnabled ?? false} disabled={isEnabled === null} onValueChange={saveIsEnabled} />
      </View>
    </View>
  );
}

/** The app's version, who made it, its license and a link to its source. */
function AboutSection() {
  const { colors, dark } = useTheme();
  const lockup = dark ? DARK_LOCKUP : LIGHT_LOCKUP;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.primary }]}>About</Text>
      <View style={styles.identity}>
        <Image source={APP_ICON} style={styles.appIcon} />
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Herdhand {Application.nativeApplicationVersion}</Text>
          <View style={styles.byLine}>
            <Text style={[styles.rowDetail, { color: colors.text }]}>by</Text>
            <Image source={lockup} accessibilityLabel="PulseCzar" style={styles.lockup} />
          </View>
        </View>
      </View>
      <Text style={[styles.rowDetail, { color: colors.text }]}>A mobile client for Herdr.</Text>
      <Text style={[styles.rowDetail, { color: colors.text }]}>
        We use Herdr every day at PulseCzar. There was no solid, simple Herdr app on Google Play, so we built one.
      </Text>
      <Text style={[styles.rowDetail, { color: colors.text }]}>Apache License 2.0</Text>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(REPOSITORY_URL)}>
        <Text style={[styles.link, { color: colors.primary }]}>Source code on GitHub</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 32 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16 },
  rowDetail: { fontSize: 14, opacity: 0.7 },
  link: { fontSize: 16, paddingVertical: 4 },
  identity: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  appIcon: { width: 44, height: 44, borderRadius: 22 },
  byLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  // The lockup image is 6.19 times as wide as it is high.
  lockup: { width: 87, height: 14 },
});
