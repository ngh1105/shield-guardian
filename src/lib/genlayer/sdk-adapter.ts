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

function getPrivateKey() {
  const privateKey =
    process.env.GENLAYER_PRIVATE_KEY?.trim() ||
    process.env.GENLAYER_ACCOUNT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("GENLAYER_PRIVATE_KEY is not set.");
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

  throw new Error("GenLayer SDK did not return a valid action check id.");
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
    status: TransactionStatus.FINALIZED,
  });

  if (!isFinishedWithReturn(receipt)) {
    throw new Error("GenLayer SDK transaction did not finish with a return value.");
  }

  const checkId = parseReturnedCheckId({
    result: receipt.result,
    consensus_data: receipt.consensus_data,
  });

  const check = (await client.readContract({
    address: contractAddress,
    functionName: "get_check",
    args: [String(checkId)],
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
