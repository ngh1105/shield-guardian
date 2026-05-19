import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CalldataAddress } from "genlayer-js/types";
import type { Address } from "viem";
import { hexToBytes } from "viem";

import type { ShieldVerdictRequest } from "@/features/shield/types";

import { createCliGenLayerAdapter } from "./genlayer/cli-adapter";
import { getClientMode, getContractAddress, hasSdkConfig } from "./genlayer/config";
import { createSdkGenLayerAdapter } from "./genlayer/sdk-adapter";
import type { GenLayerCheck, GenLayerVerdictAdapter } from "./genlayer/types";

function createGenLayerAdapter(): GenLayerVerdictAdapter {
  const mode = getClientMode();

  if (mode === "cli") {
    return createCliGenLayerAdapter();
  }

  if (mode === "sdk") {
    return createSdkGenLayerAdapter();
  }

  if (hasSdkConfig()) {
    return createSdkGenLayerAdapter();
  }

  return createCliGenLayerAdapter();
}

export async function submitVerdictRequest(
  request: ShieldVerdictRequest,
  options?: { claimedRequester?: string },
) {
  return createGenLayerAdapter().submitVerdictRequest(request, options);
}

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
