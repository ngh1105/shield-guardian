import type {
  ShieldVerdictRequest,
  ShieldVerdictResponse,
  VerdictLabel,
} from "@/features/shield/types";
import {
  extractHostname,
  isTrustedHost,
} from "@/features/shield/lib/url-safety";

const SUSPICIOUS_WORDS = [
  "claim-now",
  "bonus",
  "verify wallet",
  "drain",
  "wallet sync",
  "airdrop checker",
  "free mint",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function containsAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function buildBriefing(verdict: VerdictLabel, reasons: string[]) {
  if (verdict === "SAFE") {
    return "This action looks reasonable enough to continue, but the user should still verify the spender and amount before signing.";
  }

  if (verdict === "NOT_WORTH_IT") {
    return "The technical risk is not necessarily severe, but the economics are too poor for a retail user.";
  }

  if (verdict === "WEIRD") {
    return "This action is not clearly malicious, but it has enough ambiguity that the wallet should require extra confirmation.";
  }

  return `This action has too many high-risk signals: ${reasons[0] ?? "phishing-like behavior or an approval trap"}.`;
}

export function getShieldVerdict(
  input: ShieldVerdictRequest,
): ShieldVerdictResponse {
  const website = input.website.trim().toLowerCase();
  const hostname = extractHostname(website);
  const summary = `${input.summary} ${input.rawSignals}`.trim().toLowerCase();
  const reasons: string[] = [];
  let riskScore = 22;
  const hasRequiredContext = Boolean(hostname) && input.summary.trim().length >= 12;
  const knownActionType = ["sign", "approve", "bridge", "claim"].includes(
    input.actionType,
  );

  if (!knownActionType) {
    riskScore += 40;
    reasons.push("The action type is outside the policy set currently understood by Shield.");
  }

  if (!hasRequiredContext) {
    riskScore += 34;
    reasons.push("The packet is missing enough context to establish that the action is safe.");
  }

  if (hostname && !isTrustedHost(website)) {
    riskScore += 16;
    reasons.push("The domain is not in the default trusted host set.");
  }

  if (
    hostname?.endsWith(".xyz") ||
    hostname?.endsWith(".click") ||
    hostname?.includes("wallet") ||
    containsAny(hostname ?? "", ["claim", "bonus", "drop"])
  ) {
    riskScore += 28;
    reasons.push("The domain and landing pattern resemble common claim or phishing campaigns.");
  }

  if (containsAny(summary, SUSPICIOUS_WORDS)) {
    riskScore += 22;
    reasons.push("The description contains phrases often seen in wallet-drain or lure-claim flows.");
  }

  if (input.actionType === "approve") {
    if (containsAny(summary, ["unlimited", "max", "all", "infinite"])) {
      riskScore += 30;
      reasons.push("An unlimited approval materially increases the loss surface.");
    }

    if (!summary.includes("router") && !summary.includes("spender")) {
      riskScore += 10;
      reasons.push("The approval does not clearly describe the spender or route.");
    }
  }

  if (input.actionType === "bridge") {
    if (containsAny(summary, ["custom route", "manual route", "discord link"])) {
      riskScore += 20;
      reasons.push("The bridge route is custom or sourced from outside the official app.");
    }

    if (containsAny(summary, ["low liquidity", "experimental", "beta"])) {
      riskScore += 14;
      reasons.push("The route appears thinly liquid, experimental, or unstable.");
    }
  }

  if (input.actionType === "claim") {
    if (input.gasCostUsd > input.assetValueUsd * 0.85 && input.assetValueUsd > 0) {
      reasons.push("The claim value is almost consumed by gas cost.");
    }

    if (containsAny(summary, ["connect first", "verify first", "sync wallet"])) {
      riskScore += 18;
      reasons.push("The claim flow asks for vague wallet verification before showing real value.");
    }
  }

  if (input.actionType === "sign") {
    if (containsAny(summary, ["blind sign", "typed data", "permit"])) {
      riskScore += 12;
      reasons.push("The signing request is harder to inspect than a normal approve or swap.");
    }
  }

  if (isTrustedHost(website)) {
    riskScore -= 14;
    reasons.push("The website matches a higher-trust host in the local policy set.");
  }

  riskScore = clamp(riskScore, 8, 96);

  let verdict: VerdictLabel = "SAFE";
  if (!knownActionType || !hasRequiredContext) {
    verdict = riskScore >= 74 ? "DANGEROUS" : "WEIRD";
  } else if (
    input.actionType === "claim" &&
    input.assetValueUsd > 0 &&
    input.gasCostUsd > input.assetValueUsd * 0.85 &&
    riskScore < 65
  ) {
    verdict = "NOT_WORTH_IT";
  } else if (riskScore >= 74) {
    verdict = "DANGEROUS";
  } else if (riskScore >= 45) {
    verdict = "WEIRD";
  }

  if (!reasons.length) {
    reasons.push("No standout red flags were found in the domain, action type, or action summary.");
  }

  const confidence = clamp(
    58 + reasons.length * 8 + Math.floor(riskScore / 8),
    62,
    97,
  );
  const coverageEligible =
    (verdict === "SAFE" || verdict === "WEIRD") &&
    knownActionType &&
    hasRequiredContext;

  return {
    verdict,
    riskScore,
    confidence,
    reasons: reasons.slice(0, 4),
    nextStep:
      verdict === "SAFE"
        ? "Allow the user to continue, but still show the spender and amount before final confirmation."
        : verdict === "NOT_WORTH_IT"
          ? "Recommend skipping this action or waiting for a lower-gas window."
          : verdict === "WEIRD"
            ? "Require advanced confirmation, ask the user to verify the spender, and prefer the official host."
            : "Block by default and only allow continuation after an explicit user override.",
    coverageEligible,
    briefing: buildBriefing(verdict, reasons),
    provenance: {
      source: "mock",
      coverageStatus: coverageEligible ? "eligible" : "none",
    },
  };
}
