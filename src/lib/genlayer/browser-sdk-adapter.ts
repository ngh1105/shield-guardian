// src/lib/genlayer/browser-sdk-adapter.ts
"use client";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { Address } from "viem";

import type { ShieldVerdictRequest, ShieldVerdictResponse } from "@/features/shield/types";

import {
  isFinishedWithReturn,
  parseReturnedCheckId,
} from "./browser-sdk-helpers.mjs";
import { getContractAddress } from "./config";
import { mapCheckToVerdict } from "./map-check-to-verdict";
import type { GenLayerCheck } from "./types";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

type LeaderReceiptResult = string | { payload?: { readable?: string } };

type SdkReceipt = {
  hash?: string;
  result?: unknown;
  txExecutionResultName?: unknown;
  consensus_data?: {
    leader_receipt?: Array<{ result?: LeaderReceiptResult }>;
  };
};

export type BrowserAdapterDeps = {
  walletAddress: Address;
  provider: Eip1193Provider;
};

export type SubmitBrowserVerdictDeps = BrowserAdapterDeps & {
  onBroadcast?: (transactionHash: string) => void;
};

export async function submitBrowserVerdictRequest(
  request: ShieldVerdictRequest,
  deps: SubmitBrowserVerdictDeps,
): Promise<ShieldVerdictResponse> {
  const contractAddress = getContractAddress() as Address;

  const client = createClient({
    account: deps.walletAddress,
    chain: studionet,
    provider: deps.provider as never,
  });

  const transactionHash = await client.writeContract({
    address: contractAddress,
    functionName: "submit_action_check",
    args: [
      request.actionType,
      request.protocol,
      request.website,
      request.summary,
      request.rawSignals,
    ],
    value: BigInt(0),
  });

  if (deps.onBroadcast) {
    try {
      deps.onBroadcast(transactionHash);
    } catch {
      // Don't let a UI handler error abort the verdict; the wait below is what matters.
    }
  }

  const receipt = (await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 1_000,
    retries: 120,
  })) as SdkReceipt;

  if (!isFinishedWithReturn(receipt)) {
    throw new Error(
      "GenLayer policy court did not return a verdict for this submission. The transaction status was " +
        String(receipt.txExecutionResultName ?? "unknown") +
        ". Try again in a moment.",
    );
  }

  const checkId = parseReturnedCheckId(receipt);
  if (!checkId) {
    throw new Error(
      "GenLayer policy court returned a transaction without a parseable check id. Refresh and submit again.",
    );
  }

  const check = (await client.readContract({
    address: contractAddress,
    functionName: "get_check",
    args: [checkId],
  })) as GenLayerCheck;

  return mapCheckToVerdict(check, request, {
    contractAddress,
    transactionHash,
  });
}

export type ChallengeWriteResult = {
  transactionHash: string;
  check: GenLayerCheck;
};

export async function challengeBrowserVerdict(
  checkId: number,
  rationale: string,
  deps: BrowserAdapterDeps,
): Promise<ChallengeWriteResult> {
  const contractAddress = getContractAddress() as Address;

  const client = createClient({
    account: deps.walletAddress,
    chain: studionet,
    provider: deps.provider as never,
  });

  const transactionHash = await client.writeContract({
    address: contractAddress,
    functionName: "challenge_verdict",
    args: [checkId, rationale],
    value: BigInt(0),
  });

  await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 1_000,
    retries: 120,
  });

  const check = (await client.readContract({
    address: contractAddress,
    functionName: "get_check",
    args: [checkId],
  })) as GenLayerCheck;

  return { transactionHash, check };
}

export type LossReportWriteResult = {
  transactionHash: string;
  check: GenLayerCheck;
};

export async function reportBrowserLoss(
  checkId: number,
  txHash: string,
  lossSummary: string,
  deps: BrowserAdapterDeps,
): Promise<LossReportWriteResult> {
  const contractAddress = getContractAddress() as Address;

  const client = createClient({
    account: deps.walletAddress,
    chain: studionet,
    provider: deps.provider as never,
  });

  const transactionHash = await client.writeContract({
    address: contractAddress,
    functionName: "report_loss",
    args: [checkId, txHash, lossSummary],
    value: BigInt(0),
  });

  await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 1_000,
    retries: 120,
  });

  const check = (await client.readContract({
    address: contractAddress,
    functionName: "get_check",
    args: [checkId],
  })) as GenLayerCheck;

  return { transactionHash, check };
}
