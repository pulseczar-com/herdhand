import { router, Stack, useLocalSearchParams } from "expo-router";

import { BearingsTitle } from "./BearingsTitle";
import { useBearingsContext } from "./BearingsProvider";
import { BearingsView } from "./BearingsView";
import { NotReady } from "./NotReady";

/** The Firstmate pane's Bearings: the list of sections. A tap on a card opens the item. */
export function BearingsScreen() {
  const { id, paneId } = useLocalSearchParams<{ id: string; paneId: string }>();
  const bearings = useBearingsContext();
  if (!bearings) return <NotReady />;

  return (
    <>
      <Stack.Screen options={{ headerTitle: () => <BearingsTitle /> }} />
      <BearingsView
        onOpen={(section, row) =>
          router.push({
            pathname: "/machine/[id]/pane/[paneId]/bearings/[section]/[itemId]",
            params: { id, paneId, section: section.id, itemId: row.itemId },
          })
        }
      />
    </>
  );
}
