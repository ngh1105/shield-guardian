// src/lib/genlayer/browser-sdk-helpers.mjs
// Pure helpers extracted from browser-sdk-adapter.ts so node --test can
// exercise leader-receipt parsing without pulling in the genlayer-js SDK
// or browser-only globals.

export function parseLeaderReceiptResult(result) {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  return result.payload?.readable;
}

export function parseReturnedCheckId(receipt) {
  const readable = receipt?.consensus_data?.leader_receipt
    ?.map((entry) => parseLeaderReceiptResult(entry.result))
    .find((value) => value);
  const parsed = Number(readable);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return null;
}

export const FINISHED_WITH_RETURN = "FINISHED_WITH_RETURN";

export function isFinishedWithReturn(receipt) {
  return receipt?.txExecutionResultName === FINISHED_WITH_RETURN;
}
