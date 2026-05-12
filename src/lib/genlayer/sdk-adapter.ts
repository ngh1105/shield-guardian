import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { Address } from "viem";

import type { ShieldVerdictRequest } from "@/features/shield/types";

import { getContractAddress } from "./config";
import { mapCheckToVerdict } from "./map-check-to-verdict";
import type { GenLayerCheck, GenLayerVerdictAdapter } from "./types";

type GenLayerSdkReceiptStatus = {
  txExecutionResultName?: unknown;
};

type GenLayerSdkLeaderReceiptResult = string | { payload?: { readable?: string } };

type GenLayerSdkReceipt = {
  hash?: string;
  result?: unknown;
  consensus_data?: {
    leader_receipt?: Array<{
      result?: GenLayerSdkLeaderReceiptResult;
    }>;
  };
};

type GenLayerOverview = {
  check_count?: number;
};

function getPrivateKey() {
  const privateKey =
    process.env.GENLAYER_PRIVATE_KEY?.trim() ||
    process.env.GENLAYER_ACCOUNT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("GENLAYER_PRIVATE_KEY is not set.");
  }

  if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    return `0x${privateKey}` as `0x${string}`;
  }

  return privateKey as `0x${string}`;
}

function getContractAddressForSdk() {
  return getContractAddress() as Address;
}

function parseLeaderReceiptResult(result: GenLayerSdkLeaderReceiptResult | undefined) {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  return result.payload?.readable;
}

function parseReturnedCheckId(receipt: GenLayerSdkReceipt) {
  const readableReturn = receipt.consensus_data?.leader_receipt
    ?.map((entry) => parseLeaderReceiptResult(entry.result))
    .find((value) => value);

  const parsedCheckId = Number(readableReturn);
  if (Number.isInteger(parsedCheckId) && parsedCheckId > 0) {
    return parsedCheckId;
  }

  const directReturn = receipt.result;
  if (
    !receipt.hash &&
    typeof directReturn === "number" &&
    Number.isInteger(directReturn) &&
    directReturn > 0
  ) {
    return directReturn;
  }

  return null;
}

function parseNextCheckId(overview: GenLayerOverview) {
  const checkCount = Number(overview.check_count);
  if (Number.isInteger(checkCount) && checkCount >= 0) {
    return checkCount + 1;
  }

  return null;
}

function isFinishedWithReturn(receipt: GenLayerSdkReceiptStatus) {
  return receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN;
}

async function submitSdkVerdictRequest(request: ShieldVerdictRequest) {
  const contractAddress = getContractAddressForSdk();
  const account = createAccount(getPrivateKey());
  const client = createClient({
    account,
    chain: studionet,
  });

  const overview = (await client.readContract({
    address: contractAddress,
    functionName: "get_overview",
    args: [],
  })) as GenLayerOverview;
  const expectedCheckId = parseNextCheckId(overview);

  const transactionHash = await client.writeContract({
    account,
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

  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 1_000,
    retries: 120,
  });

  const checkId =
    isFinishedWithReturn(receipt)
      ? parseReturnedCheckId({
          result: receipt.result,
          consensus_data: receipt.consensus_data,
        })
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

export function createSdkGenLayerAdapter(): GenLayerVerdictAdapter {
  return {
    submitVerdictRequest: submitSdkVerdictRequest,
  };
}
