// Pure ESM module with the validation surface shared between the
// classic-script Chrome content script and the node:test unit tests.
// Mirror any change here in extension/content/sg-bridge.js, which
// inlines the same logic for Chrome's classic-script content_script
// loader (MV3 does not expose a "type": "module" knob for content_scripts).

export const MESSAGE_TYPES = Object.freeze({
  INTERCEPT_REQ: "SG_INTERCEPT_REQ",
  INTERCEPT_RES: "SG_INTERCEPT_RES",
  PING: "SG_PING",
});

const VALID_TYPES = new Set(Object.values(MESSAGE_TYPES));

export function isAcceptableMessage(event, ctx) {
  if (!event || typeof event !== "object") return false;
  if (event.source !== ctx.window) return false;
  if (event.origin !== ctx.origin) return false;
  const data = event.data;
  if (!data || typeof data !== "object") return false;
  if (typeof data.type !== "string" || !VALID_TYPES.has(data.type)) return false;
  return true;
}
