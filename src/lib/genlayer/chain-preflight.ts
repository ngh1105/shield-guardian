// src/lib/genlayer/chain-preflight.ts
import {
  STUDIONET_ADD_CHAIN_PARAMS,
  STUDIONET_CHAIN_ID_HEX,
} from "./studionet-params";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

const CHAIN_NOT_ADDED_CODE = 4902;

function getErrorCode(error: unknown): number | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

export async function ensureStudionet(provider: Eip1193Provider) {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === STUDIONET_CHAIN_ID_HEX.toLowerCase()) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
    });
    return;
  } catch (error) {
    if (getErrorCode(error) !== CHAIN_NOT_ADDED_CODE) {
      throw error;
    }
  }

  await provider.request({
    method: "wallet_addEthereumChain",
    params: [STUDIONET_ADD_CHAIN_PARAMS],
  });
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
  });
}
