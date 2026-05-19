export function getContractAddress() {
  const address = process.env.GENLAYER_CONTRACT_ADDRESS?.trim().replace(/^﻿/, "");
  if (!address) {
    throw new Error("GENLAYER_CONTRACT_ADDRESS is not set.");
  }
  return address;
}
