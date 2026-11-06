import AsyncStorage from "@react-native-async-storage/async-storage";

import { HERDR_KINDS, type HerdrKind } from "@/herdr/kinds";

import { parseStoredOrder } from "./order";

const SPACE_ORDER_KEY_PREFIX = "spaceOrder.";

/** The order of one Herdr kind's spaces on a machine, on this phone; the kinds have different space ids. */
export async function getSpaceOrder(machineId: string, kind: HerdrKind): Promise<string[]> {
  const stored = await AsyncStorage.getItem(getSpaceOrderKey(machineId, kind));
  return parseStoredOrder(stored);
}

export function saveSpaceOrder(machineId: string, kind: HerdrKind, order: string[]): Promise<void> {
  return AsyncStorage.setItem(getSpaceOrderKey(machineId, kind), JSON.stringify(order));
}

export function removeSpaceOrder(machineId: string): Promise<void> {
  return AsyncStorage.multiRemove(HERDR_KINDS.map((kind) => getSpaceOrderKey(machineId, kind)));
}

function getSpaceOrderKey(machineId: string, kind: HerdrKind): string {
  return `${SPACE_ORDER_KEY_PREFIX}${machineId}.${kind}`;
}
