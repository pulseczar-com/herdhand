import { MaterialIcons } from "@expo/vector-icons";
import { Tabs, useFocusEffect } from "expo-router";
import { useCallback, useContext, useEffect, useRef } from "react";

import { HeaderActions } from "@/components/HeaderActions";
import { getBlockedPanes } from "@/herdr/agentPanes";
import { MachineConnectionContext } from "@/machines/MachineConnection";
import type { SpacesState } from "@/machines/useSpaces";

const ICON_SIZE = 24;

/** The page's two tabs, Spaces and Agents, under one header with Add a machine and the gear. */
export default function TabsLayout() {
  const list = useContext(MachineConnectionContext)?.list;
  const blockedCount = getBlockedPanes(list?.spaces ?? []).length;
  const agentsLabel = blockedCount > 0 ? `Agents · ${blockedCount}` : "Agents";
  useRefreshOnReturn(list);

  return (
    <Tabs
      screenOptions={{
        headerTitle: "Herdhand",
        headerRight: () => <HeaderActions />,
        headerRightContainerStyle: { paddingRight: 16 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Spaces",
          tabBarIcon: ({ color }) => <MaterialIcons name="layers" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: "Agents",
          tabBarLabel: agentsLabel,
          tabBarIcon: ({ color }) => <MaterialIcons name="person-outline" size={ICON_SIZE} color={color} />,
        }}
      />
    </Tabs>
  );
}

/**
 * Reloads the list when the person comes back to the page, as from a pane, to show what the
 * agents did meanwhile. The first focus is the open, which loads the list itself.
 */
function useRefreshOnReturn(list: SpacesState | undefined) {
  // The focus callback stays the same, so it reads the open machine's latest refresh from here.
  const refresh = useRef(list?.refresh);
  useEffect(() => {
    refresh.current = list?.refresh;
  }, [list?.refresh]);
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      void refresh.current?.();
    }, []),
  );
}
