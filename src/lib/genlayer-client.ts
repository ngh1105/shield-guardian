import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CalldataAddress } from "genlayer-js/types";
import type { Address } from "viem";
import { hexToBytes } from "viem";

import { getContractAddress } from "./genlayer/config";
import type { GenLayerCheck } from "./genlayer/types";

function getReadOnlyClient() {
  return createClient({ chain: studionet });
}

export type ContractOverview = {
  current_epoch: number;
  check_count: number;
  safe: number;
  weird: number;
  dangerous: number;
};

export async function readOverview(): Promise<ContractOverview> {
  const client = getReadOnlyClient();
  return (await client.readContract({
    address: getContractAddress() as Address,
    functionName: "get_overview",
    args: [],
  })) as ContractOverview;
}

export async function readChecksFor(
  address: string,
  limit: number,
): Promise<GenLayerCheck[]> {
  const client = getReadOnlyClient();
  return (await client.readContract({
    address: getContractAddress() as Address,
    functionName: "get_checks_for",
    args: [new CalldataAddress(hexToBytes(address as `0x${string}`)), limit],
  })) as GenLayerCheck[];
}
