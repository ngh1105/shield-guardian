import { actionTypeForSelector } from "./selectors.mjs";

const MAX_CALLDATA_BYTES = 32 * 1024;
const MAX_SUMMARY = 280;
const MAX_RAW_SIGNALS = 1024;
const SHORT_HASH_HEAD = 6;
const SHORT_HASH_TAIL = 4;

function shortHash(value) {
  const v = String(value ?? "");
  if (v.length <= SHORT_HASH_HEAD + SHORT_HASH_TAIL + 3) return v;
  return `${v.slice(0, SHORT_HASH_HEAD)}...${v.slice(-SHORT_HASH_TAIL)}`;
}

function hexToBigInt(value) {
  if (!value || typeof value !== "string") return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function weiToEthString(weiHex) {
  const wei = hexToBigInt(weiHex);
  if (wei === 0n) return "0";
  const eth = Number(wei) / 1e18;
  if (!Number.isFinite(eth)) return wei.toString();
  return eth.toFixed(6).replace(/\.?0+$/, "");
}

function dataSelector(data) {
  if (typeof data !== "string" || !data.startsWith("0x")) return "0x";
  const body = data.slice(2);
  if (body.length < 8) return "0x";
  return `0x${body.slice(0, 8).toLowerCase()}`;
}

function clamp(value, max) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

export function buildPacket(params, ctx) {
  if (!params || typeof params !== "object") {
    throw new Error("buildPacket: missing params");
  }
  if (!params.from || typeof params.from !== "string") {
    throw new Error("buildPacket: missing from");
  }

  const data = typeof params.data === "string" ? params.data : "0x";
  const isCreation = !params.to;
  const selector = isCreation ? "0x" : dataSelector(data);
  const actionType = isCreation ? "sign" : actionTypeForSelector(selector);

  const dataBytes = data.startsWith("0x") ? (data.length - 2) / 2 : 0;
  const oversize = dataBytes > MAX_CALLDATA_BYTES;
  const truncatedData = oversize ? data.slice(0, 2 + 64) : data;

  const protocol = clamp(ctx.protocol ?? "", 64);
  const ethValue = weiToEthString(params.value ?? "0x0");

  let summary;
  if (isCreation) {
    summary = `contract deployment from ${shortHash(params.from)}`;
  } else if (oversize) {
    summary = `${actionType} via ${protocol || "unknown"}: oversize calldata (${dataBytes} B)`;
  } else if (selector === "0x" && data !== "0x") {
    summary = `${actionType} via ${protocol || "unknown"}: undecoded args`;
  } else {
    summary = `${actionType} via ${protocol || "unknown"}: to=${shortHash(params.to)}, value=${ethValue} ETH, selector=${selector}`;
  }

  const rawSignals = [
    `from=${params.from}`,
    `to=${params.to ?? "(creation)"}`,
    `value=${ethValue}`,
    `selector=${selector}`,
    `gas=${params.gas ?? "auto"}`,
    `chainId=${ctx.chainIdHex ?? "unknown"}`,
    `data=${truncatedData}`,
  ].join(" | ");

  return {
    actionType,
    protocol,
    website: ctx.website ?? "",
    summary: clamp(summary, MAX_SUMMARY),
    rawSignals: clamp(rawSignals, MAX_RAW_SIGNALS),
    assetValueUsd: 0,
    gasCostUsd: 0,
  };
}
