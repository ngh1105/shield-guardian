// src/lib/genlayer/studionet-params.ts
import { studionet } from "genlayer-js/chains";

export const STUDIONET_CHAIN_ID_HEX = `0x${studionet.id.toString(16)}` as const;

export const STUDIONET_ADD_CHAIN_PARAMS = {
  chainId: STUDIONET_CHAIN_ID_HEX,
  chainName: studionet.name,
  nativeCurrency: {
    name: studionet.nativeCurrency.name,
    symbol: studionet.nativeCurrency.symbol,
    decimals: studionet.nativeCurrency.decimals,
  },
  rpcUrls: [studionet.rpcUrls.default.http[0]],
  blockExplorerUrls: studionet.blockExplorers?.default.url
    ? [studionet.blockExplorers.default.url]
    : [],
} as const;
