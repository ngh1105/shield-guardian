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

export function senderToSendTarget(sender) {
  if (!sender || typeof sender !== "object") return null;
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return null;
  const target = { tabId };
  if (typeof sender.frameId === "number") {
    target.frameId = sender.frameId;
  }
  return target;
}

// chrome.storage.session is wiped when the SW restarts, so a long-lived
// overlay can outlive its pending entry. When that happens, fall back to the
// sender's own tab/frame so the bridge still receives the decision instead of
// the dapp promise hanging.
export function resolveDecisionTarget(entry, sender) {
  return pendingToSendTarget(entry) ?? senderToSendTarget(sender);
}
