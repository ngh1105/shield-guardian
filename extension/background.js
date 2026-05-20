/* global chrome */

import {
  DEFAULT_API_BASE_URL,
  getApiEndpoint,
  getPermissionPattern,
  hasActionType,
  parseNonNegativeNumber,
  readLastVerdict,
  readSettings,
  writeLastVerdict,
  writeSettings,
} from "./shared.js";
import {
  clearPending,
  getPending,
  pushRecent,
  setPending,
} from "./lib/intercept-store.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

async function ensureDefaultSettings() {
  const current = await readSettings();
  if (!current.apiBaseUrl) {
    await writeSettings({ apiBaseUrl: DEFAULT_API_BASE_URL });
  }
}

function asErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Shield Guardian request failed.";
}

function validateRequest(request) {
  if (!request || typeof request !== "object") {
    throw new Error("Missing verdict request.");
  }

  const actionType = String(request.actionType ?? "").trim();
  if (!hasActionType(actionType)) {
    throw new Error("Unsupported or missing actionType.");
  }

  const protocol = String(request.protocol ?? "").trim();
  const website = String(request.website ?? "").trim();
  const summary = String(request.summary ?? "").trim();
  const rawSignals = String(request.rawSignals ?? "").trim();
  const assetValueUsd = parseNonNegativeNumber(request.assetValueUsd);
  const gasCostUsd = parseNonNegativeNumber(request.gasCostUsd);

  if (!summary) {
    throw new Error("Missing action summary.");
  }

  if (!website) {
    throw new Error("Missing website.");
  }

  if (assetValueUsd === null || gasCostUsd === null) {
    throw new Error("Asset value and gas cost must be non-negative numbers.");
  }

  return {
    actionType,
    protocol,
    website,
    summary,
    rawSignals,
    assetValueUsd,
    gasCostUsd,
  };
}

async function getState() {
  const settings = await readSettings();
  const permissionPattern = getPermissionPattern(settings.apiBaseUrl);
  const permissionGranted = await chrome.permissions.contains({
    origins: [permissionPattern],
  });
  const lastVerdict = await readLastVerdict();

  return {
    ok: true,
    settings: {
      apiBaseUrl: settings.apiBaseUrl,
      apiEndpoint: getApiEndpoint(settings.apiBaseUrl),
      demoMode: settings.demoMode,
      permissionPattern,
    },
    permissionGranted,
    lastVerdict,
  };
}

async function captureActiveTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab is available.");
  }

  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("edge://")
  ) {
    throw new Error("This tab cannot be inspected by Shield Guardian.");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "SHIELD_CAPTURE_CONTEXT",
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? "Unable to capture page context.");
  }

  return {
    ok: true,
    context: {
      ...response.context,
      tabId: tab.id,
      tabTitle: tab.title ?? response.context.pageTitle ?? "",
      tabUrl: tab.url,
    },
  };
}

async function analyzeRequest(request) {
  const payload = validateRequest(request);
  const settings = await readSettings();
  const endpoint = getApiEndpoint(settings.apiBaseUrl);
  const permissionPattern = getPermissionPattern(settings.apiBaseUrl);
  const permissionGranted = await chrome.permissions.contains({
    origins: [permissionPattern],
  });

  if (!permissionGranted) {
    throw new Error(
      `Shield API access is not granted for ${settings.apiBaseUrl}. Open the extension settings and save the endpoint again.`,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);

  try {
    const headers = {
      "Content-Type": "application/json",
    };

    if (settings.demoMode) {
      headers["x-shield-demo-mode"] = "1";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(
        `Shield API returned ${response.status}. ${bodyText.slice(0, 180)}`,
      );
    }

    const data = await response.json();
    if (!data || typeof data !== "object" || !data.verdict) {
      throw new Error("Shield API returned an unexpected response shape.");
    }

    const analysis = {
      analyzedAt: Date.now(),
      apiBaseUrl: settings.apiBaseUrl,
      apiEndpoint: endpoint,
      demoMode: settings.demoMode,
      request: payload,
      response: data,
    };

    await writeLastVerdict(analysis);

    return {
      ok: true,
      analysis,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function interceptRequest({ nonce, packet, tabId, frameId }) {
  if (!nonce || !packet) {
    throw new Error("Missing intercept payload.");
  }

  const settings = await readSettings();
  const endpoint = getApiEndpoint(settings.apiBaseUrl);
  const permissionPattern = getPermissionPattern(settings.apiBaseUrl);
  const permissionGranted = await chrome.permissions.contains({
    origins: [permissionPattern],
  });

  if (!permissionGranted) {
    throw new Error(
      `Shield API access is not granted for ${settings.apiBaseUrl}. Open the extension settings and grant access.`,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  let verdict = null;
  let source = "unavailable";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Phase C-2 pre-screen always uses demo mode regardless of the
        // user's saved demoMode preference (see design spec, "Why
        // /api/verdict demo mode").
        "x-shield-demo-mode": "1",
      },
      body: JSON.stringify(packet),
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.verdict) {
        verdict = data.verdict;
        source = "demo";
      }
    }
  } catch {
    verdict = null;
  } finally {
    clearTimeout(timeoutId);
  }

  await setPending(nonce, { packet, verdict, tabId, frameId });
  await pushRecent({
    nonce,
    capturedAt: Date.now(),
    packet,
    verdict,
    source,
  });

  return { ok: true, nonce, verdict, source };
}

async function recordDecision({ nonce, choice }) {
  if (!nonce || (choice !== "proceed" && choice !== "cancel")) {
    throw new Error("Bad decision payload.");
  }
  const entry = await getPending(nonce);
  await clearPending(nonce);
  return { ok: true, nonce, choice, packet: entry?.packet ?? null, verdict: entry?.verdict ?? null };
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultSettings();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "SHIELD_GET_STATE") {
    void (async () => {
      try {
        sendResponse(await getState());
      } catch (error) {
        sendResponse({ ok: false, error: asErrorMessage(error) });
      }
    })();
    return true;
  }

  if (message.type === "SHIELD_CAPTURE_ACTIVE_TAB") {
    void (async () => {
      try {
        sendResponse(await captureActiveTabContext());
      } catch (error) {
        sendResponse({ ok: false, error: asErrorMessage(error) });
      }
    })();
    return true;
  }

  if (message.type === "SHIELD_ANALYZE") {
    void (async () => {
      try {
        sendResponse(await analyzeRequest(message.request));
      } catch (error) {
        sendResponse({ ok: false, error: asErrorMessage(error) });
      }
    })();
    return true;
  }

  if (message.type === "SHIELD_INTERCEPT") {
    void (async () => {
      try {
        sendResponse(
          await interceptRequest({
            nonce: message.nonce,
            packet: message.packet,
            tabId: sender?.tab?.id,
            frameId: sender?.frameId,
          }),
        );
      } catch (error) {
        sendResponse({ ok: false, error: asErrorMessage(error) });
      }
    })();
    return true;
  }

  if (message.type === "SHIELD_INTERCEPT_DECISION") {
    void (async () => {
      try {
        sendResponse(await recordDecision({ nonce: message.nonce, choice: message.choice }));
      } catch (error) {
        sendResponse({ ok: false, error: asErrorMessage(error) });
      }
    })();
    return true;
  }

  return false;
});
