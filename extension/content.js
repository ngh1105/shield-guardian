/* global chrome */

(function () {
  const injectedKey = "__shieldGuardianContextListener";

  if (globalThis[injectedKey]) {
    return;
  }

  globalThis[injectedKey] = true;

  function getAttributeSummary(element) {
    const parts = [];
    const inputType = element.getAttribute("type");
    const name = element.getAttribute("name");
    const autocomplete = element.getAttribute("autocomplete");
    const placeholder = element.getAttribute("placeholder");

    if (inputType) {
      parts.push(`type=${inputType}`);
    }
    if (name) {
      parts.push(`name=${name.slice(0, 60)}`);
    }
    if (autocomplete) {
      parts.push(`autocomplete=${autocomplete.slice(0, 60)}`);
    }
    if (placeholder) {
      parts.push(`placeholder=${placeholder.slice(0, 80)}`);
    }

    return parts.length ? ` (${parts.join(", ")})` : "";
  }

  function summarizeActiveElement(activeElement) {
    if (!activeElement || !activeElement.tagName) {
      return "";
    }

    const activeTag = activeElement.tagName.toLowerCase();
    if (
      activeTag === "input" ||
      activeTag === "textarea" ||
      activeElement.isContentEditable
    ) {
      return `${activeTag}${getAttributeSummary(activeElement)}: [redacted]`;
    }

    return activeTag;
  }

  function captureContext() {
    const selection = window.getSelection()?.toString().trim() ?? "";
    const activeElement = document.activeElement;

    return {
      pageUrl: location.href,
      pageOrigin: location.origin,
      pageTitle: document.title ?? "",
      selectedText: selection.slice(0, 500),
      activeElement: summarizeActiveElement(activeElement),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "SHIELD_CAPTURE_CONTEXT") {
      return false;
    }

    try {
      sendResponse({ ok: true, context: captureContext() });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to capture context.",
      });
    }

    return true;
  });
})();
