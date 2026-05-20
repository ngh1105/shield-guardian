// extension/lib/decision-routing.mjs
// Pure helpers for routing overlay decisions from the SW back to the
// originating tab/frame. Imported by extension/background.js (which is an
// ES module per manifest.json "background.type": "module") and by node --test.

const VALID_CHOICES = new Set(["proceed", "cancel"]);

export function validateDecisionChoice(choice) {
  return typeof choice === "string" && VALID_CHOICES.has(choice);
}

export function pendingToSendTarget(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.tabId !== "number") return null;
  const target = { tabId: entry.tabId };
  if (typeof entry.frameId === "number") {
    target.frameId = entry.frameId;
  }
  return target;
}
