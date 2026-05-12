import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  ShieldVerdictRequest,
  ShieldVerdictResponse,
  VerdictLabel,
} from "@/features/shield/types";

const execFileAsync = promisify(execFile);
const commandTimeoutMs = 120_000;
const commandMaxBuffer = 10 * 1024 * 1024;

let windowsCliScriptPath: string | null = null;

type GenLayerCheck = {
  action_type: string;
  challenge_count: number;
  check_id: number;
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

type GenLayerWriteReceipt = {
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

type GenLayerVerdictMetadata = {
  contractAddress: string;
  transactionHash?: string;
};

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getWindowsCliScriptPath() {
  if (windowsCliScriptPath) {
    return windowsCliScriptPath;
  }

  const candidates = [
    process.env.GENLAYER_CLI_PATH,
    path.join(process.cwd(), "node_modules", "genlayer", "dist", "index.js"),
    process.env.APPDATA
      ? path.join(process.env.APPDATA, "npm", "node_modules", "genlayer", "dist", "index.js")
      : null,
  ];

  for (const candidate of candidates) {
    if (candidate && (await fileExists(candidate))) {
      windowsCliScriptPath = candidate;
      return candidate;
    }
  }

  throw new Error("Unable to locate GenLayer CLI JavaScript entrypoint.");
}

async function getCliInvocation(args: string[]) {
  if (process.platform !== "win32") {
    return { args, executable: "genlayer" };
  }

  return {
    args: [await getWindowsCliScriptPath(), ...args],
    executable: process.execPath,
  };
}

function getContractAddress() {
  const address = process.env.GENLAYER_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error("GENLAYER_CONTRACT_ADDRESS is not set.");
  }
  return address;
}

function getAccountName() {
  return process.env.GENLAYER_ACCOUNT_NAME?.trim() || "shieldtest";
}

async function runGenLayerCommand(args: string[]) {
  const invocation = await getCliInvocation(args);
  const { stdout } = await execFileAsync(invocation.executable, invocation.args, {
    cwd: process.cwd(),
    maxBuffer: commandMaxBuffer,
    timeout: commandTimeoutMs,
  });

  return stdout;
}

function extractResultBlock(output: string) {
  const marker = "Result:";
  const start = output.indexOf(marker);
  if (start === -1) {
    throw new Error(`Missing Result block in GenLayer output.\n${output}`);
  }

  const block = output.slice(start + marker.length);
  const firstBrace = block.indexOf("{");
  if (firstBrace === -1) {
    const singleLineResult = block
      .trim()
      .split(/\r?\n/, 1)[0]
      ?.trim();
    if (!singleLineResult) {
      throw new Error(`Empty Result block in GenLayer output.\n${output}`);
    }
    return singleLineResult;
  }

  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = firstBrace; index < block.length; index += 1) {
    const character = block[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = quote !== null;
      continue;
    }

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return block.slice(firstBrace, index + 1).trim();
      }
    }
  }

  throw new Error(`Unterminated Result object in GenLayer output.\n${output}`);
}

function parseObjectLiteral<T>(output: string): T {
  const raw = extractResultBlock(output);
  return Function(`"use strict"; return (${raw});`)() as T;
}

function parseReturnedCheckId(receipt: GenLayerWriteReceipt) {
  const readableReturn = receipt.consensus_data?.leader_receipt?.find(
    (entry) => entry.result?.payload?.readable,
  )?.result?.payload?.readable;

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

  throw new Error("GenLayer did not return a valid action check id.");
}

async function waitForTransaction(hash: string | undefined) {
  if (!hash) {
    return;
  }

  await runGenLayerCommand(["receipt", hash]);
}

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

function mapCheckToVerdict(
  check: GenLayerCheck,
  request: ShieldVerdictRequest,
  metadata: GenLayerVerdictMetadata,
): ShieldVerdictResponse {
  return {
    verdict: mapVerdictLabel(check.verdict),
    riskScore: Math.round(check.risk_score_bps / 100),
    confidence: Math.round(check.confidence_bps / 100),
    reasons: buildReasons(check, request),
    nextStep: buildNextStep(check),
    coverageEligible: check.coverage_status === "eligible",
    briefing: buildBriefing(check),
    provenance: {
      source: "genlayer",
      checkId: check.check_id,
      contractAddress: metadata.contractAddress,
      transactionHash: metadata.transactionHash,
      coverageStatus: check.coverage_status,
      createdEpoch: check.created_epoch,
      lastReviewEpoch: check.last_review_epoch,
    },
  };
}

export async function submitVerdictRequest(
  request: ShieldVerdictRequest,
): Promise<ShieldVerdictResponse> {
  const contractAddress = getContractAddress();
  const accountName = getAccountName();

  await runGenLayerCommand(["account", "use", accountName]);

  const writeOutput = await runGenLayerCommand([
    "write",
    contractAddress,
    "submit_action_check",
    "--args",
    request.actionType,
    request.protocol,
    request.website,
    request.summary,
    request.rawSignals,
  ]);

  const receipt = parseObjectLiteral<GenLayerWriteReceipt>(writeOutput);
  const checkId = parseReturnedCheckId(receipt);
  await waitForTransaction(receipt.hash);

  const checkOutput = await runGenLayerCommand([
    "call",
    contractAddress,
    "get_check",
    "--args",
    String(checkId),
  ]);

  const check = parseObjectLiteral<GenLayerCheck>(checkOutput);
  return mapCheckToVerdict(check, request, {
    contractAddress,
    transactionHash: receipt.hash,
  });
}
