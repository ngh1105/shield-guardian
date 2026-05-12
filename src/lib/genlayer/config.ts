export type GenLayerClientMode = "auto" | "sdk" | "cli";

export function getContractAddress() {
  const address = process.env.GENLAYER_CONTRACT_ADDRESS?.trim().replace(/^﻿/, "");
  if (!address) {
    throw new Error("GENLAYER_CONTRACT_ADDRESS is not set.");
  }
  return address;
}

export function getAccountName() {
  const accountName = process.env.GENLAYER_ACCOUNT_NAME?.trim() || "shieldtest";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountName)) {
    throw new Error(
      "GENLAYER_ACCOUNT_NAME must contain only letters, numbers, underscores, or hyphens.",
    );
  }
  return accountName;
}

export function getClientMode(): GenLayerClientMode {
  const mode = process.env.GENLAYER_CLIENT_MODE?.trim().toLowerCase();
  if (!mode) return "auto";
  if (mode === "auto" || mode === "sdk" || mode === "cli") return mode;
  throw new Error("GENLAYER_CLIENT_MODE must be one of: auto, sdk, cli.");
}

export function hasSdkConfig() {
  return Boolean(
    process.env.GENLAYER_CONTRACT_ADDRESS &&
      (process.env.GENLAYER_PRIVATE_KEY || process.env.GENLAYER_ACCOUNT_PRIVATE_KEY),
  );
}
