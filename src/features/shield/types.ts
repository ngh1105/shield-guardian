export type ActionType = "sign" | "approve" | "bridge" | "claim";

export type VerdictLabel = "SAFE" | "WEIRD" | "DANGEROUS" | "NOT_WORTH_IT";

export type ShieldVerdictSource = "genlayer" | "mock";

export type ShieldVerdictProvenance = {
  source: ShieldVerdictSource;
  checkId?: number;
  contractAddress?: string;
  transactionHash?: string;
  coverageStatus?: string;
  createdEpoch?: number;
  lastReviewEpoch?: number;
};

export type ShieldVerdictRequest = {
  actionType: ActionType;
  protocol: string;
  website: string;
  summary: string;
  rawSignals: string;
  assetValueUsd: number;
  gasCostUsd: number;
  claimedRequester?: string;
};

export type ShieldVerdictResponse = {
  verdict: VerdictLabel;
  riskScore: number;
  confidence: number;
  reasons: string[];
  nextStep: string;
  coverageEligible: boolean;
  briefing: string;
  provenance?: ShieldVerdictProvenance;
};

export type ShieldFormState = {
  actionType: ActionType;
  protocol: string;
  website: string;
  summary: string;
  rawSignals: string;
  assetValueUsd: string;
  gasCostUsd: string;
};
