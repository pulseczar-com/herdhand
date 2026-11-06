import { useEffect, useMemo, useState } from "react";
import { reorderItems } from "react-native-reorderable-list";

import type { Space } from "@/herdr/backend";
import type { HerdrKind } from "@/herdr/kinds";

import { settleOrder } from "./order";
import { getSpaceOrder, saveSpaceOrder } from "./store";

export type SpaceOrderState = ReturnType<typeof useSpaceOrder>;

/**
 * The machine's spaces in the order kept on the phone. When the list loads, new spaces go at the
 * end and closed ones drop out. Each Herdr kind has its own order, because the kinds have
 * different space ids. Until the kind is known and its stored order is read, the spaces show in
 * Herdr's order and changes are ignored, so nothing saves over a stored order.
 */
export function useSpaceOrder(machineId: string, kind: HerdrKind | null, spaces: Space[] | null) {
  // Tagged with the order's owner, so an order read for another kind is never used for this one.
  const [loaded, setLoaded] = useState<{ owner: string; order: string[] } | null>(null);
  const owner = kind && `${machineId}.${kind}`;
  const storedOrder = loaded && loaded.owner === owner ? loaded.order : null;

  useEffect(() => {
    if (!kind || !owner) return;
    let isOpen = true;
    void getSpaceOrder(machineId, kind).then((order) => {
      if (isOpen) setLoaded({ owner, order });
    });
    return () => {
      isOpen = false;
    };
  }, [machineId, kind, owner]);

  const order = useMemo(() => {
    const known = storedOrder ?? [];
    return spaces ? settleOrder(known, spaces.map((space) => space.id)) : known;
  }, [storedOrder, spaces]);

  // The one place that saves: after a change, and after the list settles the order.
  useEffect(() => {
    if (kind && storedOrder) void saveSpaceOrder(machineId, kind, order);
  }, [machineId, kind, storedOrder, order]);

  // Until the list loads, the stored order names spaces it does not have yet.
  const orderedSpaces = useMemo(() => {
    if (!spaces) return [];
    const spacesById = new Map(spaces.map((space) => [space.id, space]));
    return order.flatMap((id) => spacesById.get(id) ?? []);
  }, [spaces, order]);

  return {
    spaces: orderedSpaces,
    moveSpace: (from: number, to: number) => {
      if (owner && storedOrder) setLoaded({ owner, order: reorderItems(order, from, to) });
    },
  };
}
