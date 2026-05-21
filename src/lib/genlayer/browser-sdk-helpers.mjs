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

// Mirrors genlayer-js `executionResultNumberToName` (genlayer-js@1.1.8):
// 0 = NOT_VOTED, 1 = FINISHED_WITH_RETURN, 2 = FINISHED_WITH_ERROR.
const EXECUTION_RESULT_BY_NUMBER = {
  0: "NOT_VOTED",
  1: "FINISHED_WITH_RETURN",
  2: "FINISHED_WITH_ERROR",
};

// SDK populates either the string `txExecutionResultName` or the numeric
// `txExecutionResult` (sometimes both, sometimes neither). Resolve to a
// single canonical label so callers don't have to branch.
export function getExecutionResultLabel(receipt) {
  if (!receipt) return undefined;
  if (typeof receipt.txExecutionResultName === "string") {
    return receipt.txExecutionResultName;
  }
  const numeric = receipt.txExecutionResult;
  if (typeof numeric === "number" && numeric in EXECUTION_RESULT_BY_NUMBER) {
    return EXECUTION_RESULT_BY_NUMBER[numeric];
  }
  return undefined;
}

export function isFinishedWithReturn(receipt) {
  return getExecutionResultLabel(receipt) === FINISHED_WITH_RETURN;
}

// Render both raw fields for diagnostic error messages — useful when the
// SDK reports the receipt in only one form and we need to know which.
export function describeExecutionResult(receipt) {
  const name = receipt?.txExecutionResultName ?? "unknown";
  const numeric = receipt?.txExecutionResult;
  return typeof numeric === "number"
    ? `${name} (code ${numeric})`
    : String(name);
}
