// src/lib/genlayer/browser-sdk-adapter.ts
"use client";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { Address } from "viem";

import type { ShieldVerdictRequest, ShieldVerdictResponse } from "@/features/shield/types";

import { getContractAddress } from "./config";
import { mapCheckToVerdict } from "./map-check-to-verdict";
import type { GenLayerCheck } from "./types";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

type GenLayerOverview = { check_count?: number };

type LeaderReceiptResult = string | { payload?: { readable?: string } };

type SdkReceipt = {
  hash?: string;
  result?: unknown;
  txExecutionResultName?: unknown;
  consensus_data?: {
    leader_receipt?: Array<{ result?: LeaderReceiptResult }>;
  };
};

function parseLeaderReceiptResult(result: LeaderReceiptResult | undefined) {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  return result.payload?.readable;
}

function parseReturnedCheckId(receipt: SdkReceipt) {
  const readable = receipt.consensus_data?.leader_receipt
    ?.map((entry) => parseLeaderReceiptResult(entry.result))
    .find((value) => value);
  const parsed = Number(readable);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  if (
    !receipt.hash &&
    typeof receipt.result === "number" &&
    Number.isInteger(receipt.result) &&
    receipt.result > 0
  ) {
    return receipt.result;
  }
  return null;
}

function parseNextCheckId(overview: GenLayerOverview) {
  const count = Number(overview.check_count);
  return Number.isInteger(count) && count >= 0 ? count + 1 : null;
}

function isFinishedWithReturn(receipt: SdkReceipt) {
  return receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN;
}

export type BrowserAdapterDeps = {
  walletAddress: Address;
  provider: Eip1193Provider;
};

export async function submitBrowserVerdictRequest(
  request: ShieldVerdictRequest,
  deps: BrowserAdapterDeps,
): Promise<ShieldVerdictResponse> {
  const contractAddress = getContractAddress() as Address;

  const client = createClient({
    account: deps.walletAddress,
    chain: studionet,
    provider: deps.provider as never,
  });

  const overview = (await client.readContract({
    address: contractAddress,
    functionName: "get_overview",
    args: [],
  })) as GenLayerOverview;
  const expectedCheckId = parseNextCheckId(overview);

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

  const receipt = (await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 1_000,
    retries: 120,
  })) as SdkReceipt;

  const checkId = isFinishedWithReturn(receipt)
    ? parseReturnedCheckId(receipt)
    : expectedCheckId;
  if (!checkId) {
    throw new Error("GenLayer SDK did not determine an action check id.");
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
