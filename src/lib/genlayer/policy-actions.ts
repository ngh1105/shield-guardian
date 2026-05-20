// src/lib/genlayer/policy-actions.ts

export const CHALLENGE_REASON_CODES = [
  "MISCLASSIFIED_SAFE",
  "MISCLASSIFIED_DANGEROUS",
  "MISSING_CONTEXT",
  "STALE_OR_CHANGED_SITE",
  "SUSPICIOUS_AFTER_REVIEW",
] as const;

export type ChallengeReasonCode = (typeof CHALLENGE_REASON_CODES)[number];

export const CHALLENGE_REASON_OPTIONS: ReadonlyArray<{
  code: ChallengeReasonCode;
  label: string;
  description: string;
}> = [
  {
    code: "MISCLASSIFIED_SAFE",
    label: "Misclassified as safe",
    description: "The verdict looked too permissive for the submitted action.",
  },
  {
    code: "MISCLASSIFIED_DANGEROUS",
    label: "Misclassified as dangerous",
    description: "The verdict looked too harsh for a known legitimate flow.",
  },
  {
    code: "MISSING_CONTEXT",
    label: "Missing context",
    description: "Website, protocol, or raw signals omitted important facts.",
  },
  {
    code: "STALE_OR_CHANGED_SITE",
    label: "Stale or changed site",
    description: "Site or transaction context changed after the check.",
  },
  {
    code: "SUSPICIOUS_AFTER_REVIEW",
    label: "Suspicious after review",
    description: "Found new suspicious evidence after the verdict.",
  },
];

export const LOSS_IMPACT_CODES = [
  "FUNDS_LOST",
  "APPROVAL_ABUSED",
  "BRIDGE_OR_SWAP_FAILURE",
  "ACCOUNT_COMPROMISED",
  "OTHER",
] as const;

export type LossImpactCode = (typeof LOSS_IMPACT_CODES)[number];

export const LOSS_IMPACT_OPTIONS: ReadonlyArray<{
  code: LossImpactCode;
  label: string;
  description: string;
}> = [
  {
    code: "FUNDS_LOST",
    label: "Funds lost",
    description: "Tokens or native value left the wallet to an attacker.",
  },
  {
    code: "APPROVAL_ABUSED",
    label: "Approval abused",
    description: "A previously granted token approval was drained.",
  },
  {
    code: "BRIDGE_OR_SWAP_FAILURE",
    label: "Bridge or swap failure",
    description: "Bridge or swap took funds without delivering on the other leg.",
  },
  {
    code: "ACCOUNT_COMPROMISED",
    label: "Account compromised",
    description: "Wallet keys or session were compromised after the action.",
  },
  {
    code: "OTHER",
    label: "Other",
    description: "Other on-chain harm not covered by the categories above.",
  },
];

export const CHALLENGE_COMMENT_MAX = 280;
export const CHALLENGE_RATIONALE_MAX = 420;
export const LOSS_COMMENT_MIN = 20;
export const LOSS_COMMENT_MAX = 500;
export const LOSS_ASSET_MAX = 32;
export const LOSS_SUMMARY_MAX = 700;
export const CHALLENGE_COUNT_WARNING_THRESHOLD = 3;

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
const AMOUNT_USD_REGEX = /^\d+(?:\.\d{1,2})?$/;

export type ChallengeRationale = {
  reason: ChallengeReasonCode;
  comment: string;
};

export type LossSummaryInput = {
  impact: LossImpactCode;
  amountUsd: string;
  asset: string;
  comment: string;
};

export function sanitizeFreeText(value: string): string {
  return value.replace(/[\r\n;]+/g, " ").replace(/\s+/g, " ").trim();
}

export function isValidTxHash(value: string): boolean {
  return TX_HASH_REGEX.test(value.trim());
}

export function normalizeTxHash(value: string): string {
  return value.trim();
}

export function normalizeAmountUsd(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!AMOUNT_USD_REGEX.test(trimmed)) return trimmed;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) return trimmed;
  return trimmed;
}

export function isValidAmountUsd(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return true;
  if (!AMOUNT_USD_REGEX.test(trimmed)) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= 0;
}

export function isChallengeReasonCode(value: string): value is ChallengeReasonCode {
  return (CHALLENGE_REASON_CODES as readonly string[]).includes(value);
}

export function isLossImpactCode(value: string): value is LossImpactCode {
  return (LOSS_IMPACT_CODES as readonly string[]).includes(value);
}

export type ChallengeValidation =
  | { ok: true; serialized: string }
  | { ok: false; error: string };

export function validateChallengeRationale(
  input: ChallengeRationale,
): ChallengeValidation {
  if (!isChallengeReasonCode(input.reason)) {
    return { ok: false, error: "Pick a reason for this challenge." };
  }
  const cleanedComment = sanitizeFreeText(input.comment);
  if (cleanedComment.length > CHALLENGE_COMMENT_MAX) {
    return {
      ok: false,
      error: `Comment must be ${CHALLENGE_COMMENT_MAX} characters or fewer.`,
    };
  }
  const serialized = serializeChallengeRationale({
    reason: input.reason,
    comment: cleanedComment,
  });
  if (serialized.length > CHALLENGE_RATIONALE_MAX) {
    return {
      ok: false,
      error: `Challenge rationale exceeds ${CHALLENGE_RATIONALE_MAX} characters.`,
    };
  }
  return { ok: true, serialized };
}

export function serializeChallengeRationale(input: ChallengeRationale): string {
  const comment = sanitizeFreeText(input.comment);
  return `reason=${input.reason};comment=${comment}`;
}

export type LossValidation =
  | { ok: true; txHash: string; serialized: string }
  | { ok: false; error: string };

export function validateLossSubmission(
  txHash: string,
  summary: LossSummaryInput,
): LossValidation {
  const normalizedTxHash = normalizeTxHash(txHash);
  if (!isValidTxHash(normalizedTxHash)) {
    return {
      ok: false,
      error: "Transaction hash must be 0x followed by 64 hex characters.",
    };
  }
  if (!isLossImpactCode(summary.impact)) {
    return { ok: false, error: "Pick an impact category for this loss." };
  }
  const cleanedComment = sanitizeFreeText(summary.comment);
  if (cleanedComment.length < LOSS_COMMENT_MIN) {
    return {
      ok: false,
      error: `Loss summary must be at least ${LOSS_COMMENT_MIN} characters after trimming.`,
    };
  }
  if (cleanedComment.length > LOSS_COMMENT_MAX) {
    return {
      ok: false,
      error: `Loss summary must be ${LOSS_COMMENT_MAX} characters or fewer.`,
    };
  }
  const cleanedAsset = sanitizeFreeText(summary.asset);
  if (cleanedAsset.length > LOSS_ASSET_MAX) {
    return {
      ok: false,
      error: `Asset label must be ${LOSS_ASSET_MAX} characters or fewer.`,
    };
  }
  const trimmedAmount = summary.amountUsd.trim();
  if (!isValidAmountUsd(trimmedAmount)) {
    return {
      ok: false,
      error:
        "Amount in USD must be a non-negative number with at most two decimal places.",
    };
  }
  const serialized = serializeLossSummary({
    impact: summary.impact,
    amountUsd: trimmedAmount,
    asset: cleanedAsset,
    comment: cleanedComment,
  });
  if (serialized.length > LOSS_SUMMARY_MAX) {
    return {
      ok: false,
      error: `Loss summary exceeds ${LOSS_SUMMARY_MAX} characters.`,
    };
  }
  return { ok: true, txHash: normalizedTxHash, serialized };
}

export function serializeLossSummary(input: LossSummaryInput): string {
  const amount = input.amountUsd.trim();
  const asset = sanitizeFreeText(input.asset);
  const comment = sanitizeFreeText(input.comment);
  return `impact=${input.impact};amount_usd=${amount};asset=${asset};comment=${comment}`;
}

export function addressesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}
