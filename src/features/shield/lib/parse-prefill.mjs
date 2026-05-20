// src/features/shield/lib/parse-prefill.mjs
const ALLOWED_ACTION_TYPES = new Set(["sign", "approve", "bridge", "claim"]);
const PREFILL_MAX_BYTES = 4096;

function decodeBase64Url(value) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf8");
  }
  const binary = atob(base64);
  let result = "";
  for (let i = 0; i < binary.length; i += 1) {
    result += String.fromCharCode(binary.charCodeAt(i));
  }
  return decodeURIComponent(escape(result));
}

function toFiniteNonNegativeNumberString(value) {
  if (value === undefined || value === null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "";
  return String(n);
}

export function parsePrefill(rawParam) {
  if (typeof rawParam !== "string" || rawParam.length === 0) return null;
  if (!/^[A-Za-z0-9_\-]+$/.test(rawParam)) return null;

  let json;
  try {
    json = decodeBase64Url(rawParam);
  } catch {
    return null;
  }
  if (json.length > PREFILL_MAX_BYTES) return null;

  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!ALLOWED_ACTION_TYPES.has(payload.actionType)) return null;

  return {
    actionType: payload.actionType,
    protocol: typeof payload.protocol === "string" ? payload.protocol : "",
    website: typeof payload.website === "string" ? payload.website : "",
    summary: typeof payload.summary === "string" ? payload.summary : "",
    rawSignals: typeof payload.rawSignals === "string" ? payload.rawSignals : "",
    assetValueUsd: toFiniteNonNegativeNumberString(payload.assetValueUsd),
    gasCostUsd: toFiniteNonNegativeNumberString(payload.gasCostUsd),
  };
}
