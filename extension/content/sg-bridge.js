/* global chrome */
// Classic content script for Chrome MV3. Mirror any change here in
// extension/content/sg-bridge-core.mjs (the testable ESM surface).

(function () {
  if (window.__shieldGuardianBridgeInstalled) return;
  window.__shieldGuardianBridgeInstalled = true;

  const MESSAGE_TYPES = {
    INTERCEPT_REQ: "SG_INTERCEPT_REQ",
    INTERCEPT_RES: "SG_INTERCEPT_RES",
    PING: "SG_PING",
  };
  const VALID_TYPES = new Set(Object.values(MESSAGE_TYPES));

  function isAcceptableMessage(event, ctx) {
    if (!event || typeof event !== "object") return false;
    if (event.source !== ctx.window) return false;
    if (event.origin !== ctx.origin) return false;
    const data = event.data;
    if (!data || typeof data !== "object") return false;
    if (typeof data.type !== "string" || !VALID_TYPES.has(data.type)) return false;
    return true;
  }

  if (typeof chrome === "undefined" || !chrome.runtime) return;

  const ctx = { window, origin: window.location.origin };

  window.addEventListener("message", (event) => {
    if (!isAcceptableMessage(event, ctx)) return;
    if (event.data.type === MESSAGE_TYPES.PING) {
      window.postMessage(
        { type: MESSAGE_TYPES.INTERCEPT_RES, nonce: event.data.nonce, choice: "pong" },
        ctx.origin,
      );
    }
  });
})();
