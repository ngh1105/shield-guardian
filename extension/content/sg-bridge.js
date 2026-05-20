/* global chrome */
// Classic content script for Chrome MV3. Mirror any change to MESSAGE_TYPES,
// isAcceptableMessage, or buildOverlayDecisionResponse in
// extension/content/sg-bridge-core.mjs, which is the testable ESM surface
// (Chrome MV3 does not expose a "type": "module" knob for content_scripts,
// so this file inlines the same logic by hand).

(function () {
  if (window.__shieldGuardianBridgeInstalled) return;
  window.__shieldGuardianBridgeInstalled = true;

  const MESSAGE_TYPES = {
    INTERCEPT_REQ: "SG_INTERCEPT_REQ",
    INTERCEPT_RES: "SG_INTERCEPT_RES",
    PING: "SG_PING",
  };
  const VALID_TYPES = new Set(Object.values(MESSAGE_TYPES));
  const OVERLAY_ID = "shield-guardian-overlay-frame";

  function isAcceptableMessage(event, ctx) {
    if (!event || typeof event !== "object") return false;
    if (event.source !== ctx.window) return false;
    if (event.origin !== ctx.origin) return false;
    const data = event.data;
    if (!data || typeof data !== "object") return false;
    if (typeof data.type !== "string" || !VALID_TYPES.has(data.type)) return false;
    return true;
  }

  function buildOverlayDecisionResponse(message) {
    if (!message || typeof message !== "object") return null;
    if (message.type !== "SHIELD_OVERLAY_DECISION") return null;
    if (typeof message.nonce !== "string" || message.nonce.length === 0) return null;
    if (typeof message.choice !== "string" || message.choice.length === 0) return null;
    return {
      type: MESSAGE_TYPES.INTERCEPT_RES,
      nonce: message.nonce,
      choice: message.choice,
    };
  }

  function ensureOverlay(nonce) {
    let frame = document.getElementById(OVERLAY_ID);
    if (frame) {
      frame.dataset.nonce = nonce;
      return frame;
    }
    frame = document.createElement("iframe");
    frame.id = OVERLAY_ID;
    frame.dataset.nonce = nonce;
    frame.src = chrome.runtime.getURL(
      `overlay/sg-overlay.html?nonce=${encodeURIComponent(nonce)}`,
    );
    Object.assign(frame.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      border: "0",
      zIndex: "2147483646",
      background: "transparent",
      colorScheme: "dark",
    });
    document.documentElement.appendChild(frame);
    return frame;
  }

  function removeOverlay() {
    const frame = document.getElementById(OVERLAY_ID);
    if (frame) frame.remove();
  }

  async function relayIntercept(event, ctx) {
    const { nonce, packet } = event.data;
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "SHIELD_INTERCEPT",
        nonce,
        packet,
      });
    } catch (error) {
      response = { ok: false, error: error?.message ?? "runtime unavailable" };
    }

    if (!response?.ok) {
      ctx.window.postMessage(
        { type: MESSAGE_TYPES.INTERCEPT_RES, nonce, choice: "cancel" },
        ctx.origin,
      );
      return;
    }

    ensureOverlay(nonce);
  }

  if (typeof chrome === "undefined" || !chrome.runtime) return;
  if (window.top !== window) return;

  const ctx = { window, origin: window.location.origin };

  window.addEventListener("message", (event) => {
    if (!isAcceptableMessage(event, ctx)) return;
    if (event.data.type === MESSAGE_TYPES.INTERCEPT_REQ) {
      relayIntercept(event, ctx);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    const response = buildOverlayDecisionResponse(message);
    if (!response) return false;
    ctx.window.postMessage(response, ctx.origin);
    removeOverlay();
    return false;
  });
})();
