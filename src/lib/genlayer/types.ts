import type {
  ShieldVerdictRequest,
  ShieldVerdictResponse,
} from "@/features/shield/types";

export type GenLayerCheck = {
  action_type: string;
  challenge_count: number;
  check_id: number;
  claimed_requester: string;
  confidence_bps: number;
  coverage_status: string;
  created_epoch: number;
  last_review_epoch: number;
  loss_report_tx_hash: string;
  note: string;
  protocol: string;
  raw_signals: string;
  requester: string;
  risk_score_bps: number;
  summary: string;
  verdict: "safe" | "weird" | "dangerous";
  website: string;
};

export type GenLayerWriteReceipt = {
  hash?: string;
  result?: unknown;
  consensus_data?: {
    leader_receipt?: Array<{
      result?: {
        payload?: {
          readable?: string;
        };
      };
    }>;
  };
};

export type GenLayerVerdictMetadata = {
  contractAddress: string;
  transactionHash?: string;
};

export type GenLayerVerdictAdapter = {
  submitVerdictRequest(
    request: ShieldVerdictRequest,
    options?: { claimedRequester?: string },
  ): Promise<ShieldVerdictResponse>;
};
