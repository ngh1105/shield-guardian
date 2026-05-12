/* global chrome */

(function () {
  const injectedKey = "__shieldGuardianContextListener";

  if (globalThis[injectedKey]) {
    return;
  }

  globalThis[injectedKey] = true;

  function captureContext() {
    const selection = window.getSelection()?.toString().trim() ?? "";
    const activeElement = document.activeElement;
    const activeTag =
      activeElement && activeElement.tagName ? activeElement.tagName.toLowerCase() : "";
    const activeValue =
      activeElement && typeof activeElement.value === "string"
        ? activeElement.value.trim()
        : "";

    return {
      pageUrl: location.href,
      pageOrigin: location.origin,
      pageTitle: document.title ?? "",
      selectedText: selection.slice(0, 500),
      activeElement: activeTag ? `${activeTag}${activeValue ? `: ${activeValue.slice(0, 120)}` : ""}` : "",
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
