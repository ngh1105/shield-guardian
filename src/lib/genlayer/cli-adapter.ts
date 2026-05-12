import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { ShieldVerdictRequest } from "@/features/shield/types";

import { getAccountName, getContractAddress } from "./config";
import { mapCheckToVerdict } from "./map-check-to-verdict";
import type {
  GenLayerCheck,
  GenLayerVerdictAdapter,
  GenLayerWriteReceipt,
} from "./types";

const execFileAsync = promisify(execFile);
const commandTimeoutMs = 120_000;
const commandMaxBuffer = 10 * 1024 * 1024;

let windowsCliScriptPath: string | null = null;

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

function quoteObjectKeys(value: string) {
  return value.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

function normalizePythonJsonLiterals(value: string) {
  return value
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false");
}

function parseObjectLiteral<T>(output: string): T {
  const raw = extractResultBlock(output);

  try {
    return JSON.parse(raw) as T;
  } catch {
    const normalized = quoteObjectKeys(normalizePythonJsonLiterals(raw));
    return JSON.parse(normalized) as T;
  }
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

async function submitCliVerdictRequest(request: ShieldVerdictRequest) {
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

export function createCliGenLayerAdapter(): GenLayerVerdictAdapter {
  return {
    submitVerdictRequest: submitCliVerdictRequest,
  };
}
