import type { ShieldVerdictRequest, VerdictLabel } from "@/features/shield/types";

import type { GenLayerCheck, GenLayerVerdictMetadata } from "./types";

function mapVerdictLabel(value: GenLayerCheck["verdict"]): VerdictLabel {
  if (value === "safe") return "SAFE";
  if (value === "dangerous") return "DANGEROUS";
  return "WEIRD";
}

function buildReasons(check: GenLayerCheck, request: ShieldVerdictRequest) {
  const reasons = [
    `On-chain policy verdict returned ${check.verdict} for ${check.action_type}.`,
    `Protocol ${check.protocol || "unknown"} on host ${check.website}.`,
    `Signals submitted: ${check.raw_signals || "none provided"}.`,
    `Policy note: ${check.note}`,
  ];

  if (request.assetValueUsd > 0) {
    reasons[1] += ` Asset value ${request.assetValueUsd} USD, gas ${request.gasCostUsd} USD.`;
  }

  return reasons;
}

function buildBriefing(check: GenLayerCheck) {
  if (check.verdict === "dangerous") {
    return "GenLayer policy resolved this action as dangerous. Do not continue unless you fully trust the source and intent.";
  }

  if (check.verdict === "weird") {
    return "GenLayer policy found enough ambiguity to escalate this action. Verify the site, spender, and intent before continuing.";
  }

  return "GenLayer policy considers this action acceptable, but the user should still verify the final signing details.";
}

function buildNextStep(check: GenLayerCheck) {
  if (check.verdict === "dangerous") {
    return "Block the action by default and require an explicit override to continue.";
  }

  if (check.verdict === "weird") {
    return "Ask the user to perform an extra confirmation and verify the official host before signing.";
  }

  return "Allow the action to proceed while still displaying the final spender and amount.";
}

export function mapCheckToVerdict(
  check: GenLayerCheck,
  request: ShieldVerdictRequest,
  metadata: GenLayerVerdictMetadata,
) {
  return {
    verdict: mapVerdictLabel(check.verdict),
    riskScore: Math.round(check.risk_score_bps / 100),
    confidence: Math.round(check.confidence_bps / 100),
    reasons: buildReasons(check, request),
    nextStep: buildNextStep(check),
    coverageEligible: check.coverage_status === "eligible",
    briefing: buildBriefing(check),
    provenance: {
      source: "genlayer" as const,
      checkId: check.check_id,
      contractAddress: metadata.contractAddress,
      transactionHash: metadata.transactionHash,
      coverageStatus: check.coverage_status,
      createdEpoch: check.created_epoch,
      lastReviewEpoch: check.last_review_epoch,
      requester: check.requester,
      claimedRequester: check.claimed_requester,
      challengeCount: check.challenge_count,
      lossReportTxHash: check.loss_report_tx_hash,
      note: check.note,
      rawVerdict: check.verdict,
    },
  };
}
