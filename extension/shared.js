/* global chrome */

export const DEFAULT_API_BASE_URL = "http://localhost:3000";

export const STORAGE_KEYS = {
  lastVerdict: "shieldGuardian.lastVerdict",
  settings: "shieldGuardian.settings",
};

export const ACTION_TYPES = ["sign", "approve", "bridge", "claim"];

export const DEMO_PACKETS = [
  {
    name: "Safe swap",
    tone: "safe",
    description: "Trusted host, visible router, normal approval.",
    values: {
      actionType: "approve",
      protocol: "Uniswap",
      website: "https://app.uniswap.org",
      summary: "Approve WETH to Uniswap router for a 240 USD swap.",
      rawSignals: "Exact spender is visible, router path is standard, no custom route.",
      assetValueUsd: "240",
      gasCostUsd: "3.5",
    },
  },
  {
    name: "Weird bridge",
    tone: "weird",
    description: "Custom bridge route shared outside the official app.",
    values: {
      actionType: "bridge",
      protocol: "Unknown bridge",
      website: "https://bridge-preview.app",
      summary: "Bridge ETH from Base to Arbitrum through a custom route shared in Discord.",
      rawSignals: "Experimental route, low liquidity, beta status, manual route.",
      assetValueUsd: "500",
      gasCostUsd: "9",
    },
  },
  {
    name: "Dangerous claim",
    tone: "dangerous",
    description: "Phishing-style claim with wallet verification language.",
    values: {
      actionType: "claim",
      protocol: "Retrodrop portal",
      website: "https://claim-now-bonus.xyz",
      summary: "Claim bonus retrodrop and verify wallet before revealing the amount.",
      rawSignals: "Free mint, verify wallet, claim now, sync wallet, connect first.",
      assetValueUsd: "65",
      gasCostUsd: "14",
    },
  },
];

export function normalizeApiBaseUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return DEFAULT_API_BASE_URL;
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(candidate);
  return url.origin;
}

export function getApiEndpoint(baseUrl) {
  return new URL("/api/verdict", normalizeApiBaseUrl(baseUrl)).href;
}

export function getPermissionPattern(baseUrl) {
  const url = new URL(normalizeApiBaseUrl(baseUrl));
  return `${url.protocol}//${url.hostname}/*`;
}

export function getStorageSettings() {
  return chrome.storage.sync.get(STORAGE_KEYS.settings);
}

export async function readSettings() {
  const result = await getStorageSettings();
  const settings = result[STORAGE_KEYS.settings] ?? {};

  return {
    apiBaseUrl: settings.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    demoMode: Boolean(settings.demoMode),
  };
}

export async function writeSettings(settings) {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.settings]: {
      apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl),
      demoMode: Boolean(settings.demoMode),
    },
  });
}

export async function readLastVerdict() {
  const result = await chrome.storage.session.get(STORAGE_KEYS.lastVerdict);
  return result[STORAGE_KEYS.lastVerdict] ?? null;
}

export async function writeLastVerdict(value) {
  await chrome.storage.session.set({
    [STORAGE_KEYS.lastVerdict]: value,
  });
}

export function hasActionType(value) {
  return ACTION_TYPES.includes(value);
}

export function parseNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function extractHostname(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  try {
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function clampText(value, maxLength = 180) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function verdictTone(verdict) {
  if (verdict === "SAFE") {
    return "safe";
  }

  if (verdict === "WEIRD") {
    return "weird";
  }

  if (verdict === "DANGEROUS") {
    return "dangerous";
  }

  return "neutral";
}

export function defaultFormState() {
  return {
    actionType: "approve",
    protocol: "",
    website: "",
    summary: "",
    rawSignals: "",
    assetValueUsd: "",
    gasCostUsd: "",
  };
}

export function createWarningCopy(verdict) {
  if (verdict === "SAFE") {
    return {
      title: "Safe",
      body: "The action looks acceptable. The user should still verify the final spender, amount, and domain.",
    };
  }

  if (verdict === "WEIRD") {
    return {
      title: "Warning",
      body: "The action is ambiguous enough to require a deliberate second check before continuing.",
    };
  }

  if (verdict === "DANGEROUS") {
    return {
      title: "Dangerous",
      body: "The action has strong risky signals. Treat it as hostile and abort unless the source is independently verified.",
    };
  }

  return {
    title: "Unknown",
    body: "Shield Guardian could not classify this action.",
  };
}
