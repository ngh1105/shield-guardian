export function getContractAddress() {
  const address = (
    process.env.NEXT_PUBLIC_PHASE_B_CONTRACT ??
    process.env.GENLAYER_CONTRACT_ADDRESS
  )
    ?.trim()
    .replace(/^\uFEFF/, "");
  if (!address) {
    throw new Error(
      "GenLayer policy court address is not configured. Set NEXT_PUBLIC_PHASE_B_CONTRACT (browser) or GENLAYER_CONTRACT_ADDRESS (server) in .env.local and restart the dev server.",
    );
  }
  return address;
}

export function hasContractAddress() {
  const address =
    process.env.NEXT_PUBLIC_PHASE_B_CONTRACT ??
    process.env.GENLAYER_CONTRACT_ADDRESS;
  return Boolean(address?.trim());
}
