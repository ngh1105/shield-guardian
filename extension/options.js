/* global chrome */

import {
  DEFAULT_API_BASE_URL,
  getPermissionPattern,
  normalizeApiBaseUrl,
  readSettings,
  writeSettings,
} from "./shared.js";

const refs = {};

function $(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing settings element: ${id}`);
  }
  return element;
}

function setNotice(type, message) {
  if (!message) {
    refs.settingsNotice.className = "notice hidden";
    refs.settingsNotice.textContent = "";
    return;
  }

  refs.settingsNotice.className = `notice ${type}`;
  refs.settingsNotice.textContent = message;
}

async function hasPermission(pattern) {
  return chrome.permissions.contains({ origins: [pattern] });
}

async function updatePermissionBadge(apiBaseUrl) {
  const pattern = getPermissionPattern(apiBaseUrl);
  const granted = await hasPermission(pattern);
  refs.permissionBadge.textContent = granted ? "Access granted" : "Access pending";
  refs.permissionBadge.className = `status-pill ${granted ? "tone-safe" : "tone-weird"}`;
  refs.permissionHelp.textContent = granted
    ? `Chrome has access to ${pattern}.`
    : `Chrome will ask for access to ${pattern} after you save.`;
}

async function loadSettings() {
  const current = await readSettings();
  refs.apiBaseUrl.value = current.apiBaseUrl || DEFAULT_API_BASE_URL;
  refs.demoMode.checked = current.demoMode;
  await updatePermissionBadge(refs.apiBaseUrl.value);
}

async function saveSettings(event) {
  event.preventDefault();
  setNotice("", "");

  let normalized;
  try {
    normalized = normalizeApiBaseUrl(refs.apiBaseUrl.value);
  } catch {
    setNotice("error", "Enter a valid API URL such as http://localhost:3000.");
    return;
  }

  const nextPattern = getPermissionPattern(normalized);
  const previous = await readSettings();
  const previousPattern = getPermissionPattern(previous.apiBaseUrl);
  const currentGranted = await hasPermission(nextPattern);

  let granted = currentGranted;
  if (!currentGranted) {
    granted = await chrome.permissions.request({
      origins: [nextPattern],
    });
  }

  if (!granted) {
    refs.apiBaseUrl.value = previous.apiBaseUrl;
    setNotice("warning", "Permission was not granted. Settings were not saved.");
    await updatePermissionBadge(previous.apiBaseUrl);
    return;
  }

  await writeSettings({
    apiBaseUrl: normalized,
    demoMode: refs.demoMode.checked,
  });

  if (previousPattern !== nextPattern) {
    await chrome.permissions.remove({
      origins: [previousPattern],
    });
  }

  refs.apiBaseUrl.value = normalized;
  await updatePermissionBadge(normalized);
  setNotice(
    "success",
    refs.demoMode.checked
      ? `Saved ${normalized}. Demo mode is enabled and verdicts will be labeled as mock/demo.`
      : `Saved ${normalized} and granted access for live verdict requests.`,
  );
}

async function resetToLocalhost() {
  refs.apiBaseUrl.value = DEFAULT_API_BASE_URL;
  refs.demoMode.checked = false;
  await updatePermissionBadge(DEFAULT_API_BASE_URL);
  setNotice("info", "Local development endpoint restored. Save to request access.");
}

function init() {
  refs.settingsForm = $("settingsForm");
  refs.apiBaseUrl = $("apiBaseUrl");
  refs.demoMode = $("demoMode");
  refs.permissionBadge = $("permissionBadge");
  refs.permissionHelp = $("permissionHelp");
  refs.settingsNotice = $("settingsNotice");
  refs.saveButton = $("saveButton");
  refs.resetButton = $("resetButton");
  refs.previewPopupButton = $("previewPopupButton");

  refs.settingsForm.addEventListener("submit", saveSettings);
  refs.resetButton.addEventListener("click", resetToLocalhost);
  refs.previewPopupButton.addEventListener("click", async () => {
    try {
      await chrome.action.openPopup();
      setNotice("success", "Opened the Shield Guardian popup for preview.");
    } catch (error) {
      setNotice(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to open the popup from this browser window.",
      );
    }
  });
  refs.apiBaseUrl.addEventListener("input", () => {
    setNotice("", "");
  });
  refs.demoMode.addEventListener("change", () => {
    setNotice("", "");
  });

  void loadSettings().catch((error) => {
    setNotice("error", error instanceof Error ? error.message : "Failed to load settings.");
  });
}

document.addEventListener("DOMContentLoaded", init);
