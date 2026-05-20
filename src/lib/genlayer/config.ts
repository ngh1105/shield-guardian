export function getContractAddress() {
  const address = (
    process.env.NEXT_PUBLIC_PHASE_B_CONTRACT ??
    process.env.GENLAYER_CONTRACT_ADDRESS
  )
    ?.trim()
    .replace(/^\uFEFF/, "");
  if (!address) {
    throw new Error("NEXT_PUBLIC_PHASE_B_CONTRACT is not set.");
  }
  return address;
}
