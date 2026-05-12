import type { ShieldVerdictRequest } from "@/features/shield/types";

import { createCliGenLayerAdapter } from "./genlayer/cli-adapter";
import { getClientMode, hasSdkConfig } from "./genlayer/config";
import { createSdkGenLayerAdapter } from "./genlayer/sdk-adapter";
import type { GenLayerVerdictAdapter } from "./genlayer/types";

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

export async function submitVerdictRequest(request: ShieldVerdictRequest) {
  return createGenLayerAdapter().submitVerdictRequest(request);
}
