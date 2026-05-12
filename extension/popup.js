/* global chrome */

import {
  clampText,
  createWarningCopy,
  defaultFormState,
  DEMO_PACKETS,
  extractHostname,
  formatDateTime,
  hasActionType,
  parseNonNegativeNumber,
  verdictTone,
} from "./shared.js";

const refs = {};
const state = {
  acknowledgement: false,
  analyzing: false,
  connection: null,
  connectionError: "",
  lastVerdict: null,
  tabContext: null,
};

const formState = defaultFormState();

function $(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing popup element: ${id}`);
  }
  return element;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatusNotice(type, message) {
  if (!message) {
    refs.formNotice.className = "notice hidden";
    refs.formNotice.textContent = "";
    return;
  }

  refs.formNotice.className = `notice ${type}`;
  refs.formNotice.textContent = message;
}

function syncInputs() {
  refs.actionType.value = formState.actionType;
  refs.protocol.value = formState.protocol;
  refs.website.value = formState.website;
  refs.summary.value = formState.summary;
  refs.rawSignals.value = formState.rawSignals;
  refs.assetValueUsd.value = formState.assetValueUsd;
  refs.gasCostUsd.value = formState.gasCostUsd;
}

function readInputsIntoState() {
  formState.actionType = refs.actionType.value;
  formState.protocol = refs.protocol.value;
  formState.website = refs.website.value;
  formState.summary = refs.summary.value;
  formState.rawSignals = refs.rawSignals.value;
  formState.assetValueUsd = refs.assetValueUsd.value;
  formState.gasCostUsd = refs.gasCostUsd.value;
}

function renderConnection() {
  if (!state.connection) {
    refs.accessBadge.textContent = state.connectionError ? "Error" : "Unavailable";
    refs.accessBadge.className = `status-pill ${
      state.connectionError ? "tone-dangerous" : "tone-neutral"
    }`;
    refs.accessText.textContent = state.connectionError
      ? state.connectionError
      : "Shield API state is not available yet.";
    refs.subtitle.textContent = "Waiting for extension state.";
    return;
  }

  const { settings, permissionGranted, lastVerdict } = state.connection;
  refs.accessBadge.textContent = permissionGranted ? "Ready" : "Needs access";
  refs.accessBadge.className = `status-pill ${permissionGranted ? "tone-safe" : "tone-weird"}`;

  const verdictLabel = lastVerdict?.response?.verdict?.verdict
    ? `Last verdict: ${lastVerdict.response.verdict.verdict}`
    : "No verdict cached yet.";

  refs.accessText.textContent = permissionGranted
    ? `Live requests go to ${settings.apiEndpoint}. ${verdictLabel}`
    : `Save and grant ${settings.permissionPattern} in settings to enable live verdicts.`;

  refs.subtitle.textContent = permissionGranted
    ? settings.demoMode
      ? `Demo mode via ${settings.apiBaseUrl}`
      : `Live mode via ${settings.apiBaseUrl}`
    : `Configure the API origin to begin`;

  if (permissionGranted && settings.demoMode) {
    refs.accessText.textContent = `Demo mode is enabled for ${settings.apiEndpoint}. Verdicts will be labeled as mock/demo.`;
  }
}

function renderTabContext() {
  if (!state.tabContext) {
    refs.tabContext.innerHTML = `
      <p class="context-empty">
        Capture the active tab to prefill the packet and attach page context to the verdict.
      </p>
    `;
    return;
  }

  const { pageUrl, pageOrigin, pageTitle, selectedText, activeElement } = state.tabContext;
  refs.tabContext.innerHTML = `
    <div class="context-grid">
      <div class="context-row">
        <span class="context-label">Page title</span>
        <span class="context-value">${escapeHtml(clampText(pageTitle || "Untitled page", 120))}</span>
      </div>
      <div class="context-row">
        <span class="context-label">Page URL</span>
        <span class="context-value mono">${escapeHtml(pageUrl || pageOrigin || "")}</span>
      </div>
      <div class="context-row">
        <span class="context-label">Selected text</span>
        <span class="context-value">${escapeHtml(
          selectedText ? clampText(selectedText, 180) : "No selection captured.",
        )}</span>
      </div>
      <div class="context-row">
        <span class="context-label">Active element</span>
        <span class="context-value mono">${escapeHtml(activeElement || "None")}</span>
      </div>
    </div>
  `;
}

function fillFromTabContext(context, force = false) {
  const nextWebsite = context.pageUrl || context.pageOrigin || "";
  const nextSummary =
    context.pageTitle ||
    (context.selectedText ? clampText(context.selectedText, 120) : "") ||
    nextWebsite ||
    "Review wallet action";
  const nextSignals = [
    context.pageOrigin ? `Origin: ${context.pageOrigin}` : null,
    context.pageTitle ? `Title: ${context.pageTitle}` : null,
    context.selectedText ? `Selection: ${context.selectedText}` : null,
    context.activeElement ? `Active element: ${context.activeElement}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  if (force || !formState.website.trim()) {
    formState.website = nextWebsite;
  }

  if (force || !formState.summary.trim()) {
    formState.summary = nextSummary;
  }

  if (force || !formState.rawSignals.trim()) {
    formState.rawSignals = nextSignals;
  }

  if (force || !formState.protocol.trim()) {
    formState.protocol = context.pageTitle
      ? clampText(context.pageTitle.replace(/\s+/g, " "), 64)
      : extractHostname(nextWebsite);
  }

  syncInputs();
}

function renderVerdict(record) {
  if (!record) {
    refs.verdictPanel.innerHTML = `
      <div class="verdict-placeholder">
        No verdict yet. Capture the tab or submit a packet to see Shield Guardian respond.
      </div>
    `;
    return;
  }

  const verdict = record.response.verdict;
  const tone = verdictTone(verdict.verdict);
  const warning = createWarningCopy(verdict.verdict);
  const analyzedAt = formatDateTime(record.analyzedAt);
  const reasons = Array.isArray(verdict.reasons) ? verdict.reasons : [];
  const provenanceRows = buildProvenanceRows(verdict);

  refs.verdictPanel.innerHTML = `
    <div class="verdict-top">
      <div>
        <p class="eyebrow">Latest verdict</p>
        <h3>${escapeHtml(warning.title)}</h3>
      </div>
      <span class="status-pill tone-${tone}">${escapeHtml(verdict.verdict)}</span>
    </div>

    <div class="verdict-top">
      <div>
        <div class="verdict-score">${escapeHtml(String(verdict.riskScore ?? 0))}<span>/100</span></div>
        <p class="muted">Confidence ${escapeHtml(String(verdict.confidence ?? 0))}%</p>
      </div>
      <div class="verdict-meta">
        <span>${verdict.coverageEligible ? "Coverage eligible" : "Coverage denied"}</span>
        <span>${escapeHtml(analyzedAt || "Just now")}</span>
      </div>
    </div>

    ${
      provenanceRows.length
        ? `
          <div class="provenance-strip">
            ${provenanceRows
              .map(
                (row) => `
                  <div class="provenance-item">
                    <span>${escapeHtml(row.label)}</span>
                    <strong title="${escapeHtml(row.title || row.value)}">${escapeHtml(row.value)}</strong>
                  </div>
                `,
              )
              .join("")}
          </div>
        `
        : ""
    }

    <div class="warning-box ${tone}">
      <div class="warning-title">${escapeHtml(warning.title)}</div>
      <div class="warning-body">${escapeHtml(warning.body)}</div>
      ${
        verdict.briefing
          ? `<div class="notice info">${escapeHtml(verdict.briefing)}</div>`
          : ""
      }
      ${
        verdict.verdict === "WEIRD"
          ? `
            <div class="button-row">
              <button type="button" class="ghost-button small-button" data-action="ack-warning">
                ${state.acknowledgement ? "Warning acknowledged" : "Acknowledge warning"}
              </button>
            </div>
            ${
              state.acknowledgement
                ? '<div class="notice success">Warning acknowledged. The popup is still not signing anything for you.</div>'
                : ""
            }
          `
          : ""
      }
    </div>

    <div class="reasons">
      ${reasons
        .map((reason) => `<div class="reason">${escapeHtml(clampText(reason, 240))}</div>`)
        .join("")}
    </div>

    <div class="next-step">
      <span>Next step</span>
      <p>${escapeHtml(verdict.nextStep || "Review the action manually.")}</p>
    </div>
  `;
}

function formatShortHash(value) {
  if (!value || value.length <= 18) {
    return value || "";
  }

  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function buildProvenanceRows(verdict) {
  const provenance = verdict.provenance;
  if (!provenance) {
    return [];
  }

  return [
    {
      label: "Source",
      value: provenance.source === "genlayer" ? "GenLayer live" : "Demo/mock",
    },
    provenance.checkId ? { label: "Check", value: `#${provenance.checkId}` } : null,
    provenance.coverageStatus
      ? { label: "Coverage", value: provenance.coverageStatus }
      : null,
    provenance.contractAddress
      ? {
          label: "Contract",
          value: formatShortHash(provenance.contractAddress),
          title: provenance.contractAddress,
        }
      : null,
    provenance.transactionHash
      ? {
          label: "Tx",
          value: formatShortHash(provenance.transactionHash),
          title: provenance.transactionHash,
        }
      : null,
  ].filter(Boolean);
}

function renderDemoPackets() {
  refs.demoPackets.innerHTML = DEMO_PACKETS.map(
    (packet, index) => `
      <button class="demo-packet-button ${packet.tone}" type="button" data-demo-index="${index}">
        <span>${escapeHtml(packet.name)}</span>
        <strong>${escapeHtml(packet.description)}</strong>
      </button>
    `,
  ).join("");
}

function loadDemoPacket(index) {
  const packet = DEMO_PACKETS[index];
  if (!packet) {
    return;
  }

  Object.assign(formState, packet.values);
  syncInputs();
  state.acknowledgement = false;
  setStatusNotice("info", `Loaded demo packet: ${packet.name}.`);
}

function buildRequestPayload() {
  readInputsIntoState();

  const assetValueUsd = parseNonNegativeNumber(formState.assetValueUsd);
  const gasCostUsd = parseNonNegativeNumber(formState.gasCostUsd);

  if (!hasActionType(formState.actionType)) {
    throw new Error("Choose a supported action type.");
  }

  if (!extractHostname(formState.website)) {
    throw new Error("Enter a valid website or host.");
  }

  if (!formState.summary.trim()) {
    throw new Error("Add a short action summary.");
  }

  if (assetValueUsd === null || gasCostUsd === null) {
    throw new Error("Asset value and gas cost must be non-negative numbers.");
  }

  return {
    actionType: formState.actionType,
    protocol: formState.protocol.trim(),
    website: formState.website.trim(),
    summary: formState.summary.trim(),
    rawSignals: formState.rawSignals.trim(),
    assetValueUsd,
    gasCostUsd,
  };
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response) {
    throw new Error("No response from background worker.");
  }

  if (response.ok === false) {
    throw new Error(response.error || "Background request failed.");
  }

  return response;
}

async function loadInitialState() {
  const [connectionResponse, captureResponse] = await Promise.allSettled([
    sendMessage({ type: "SHIELD_GET_STATE" }),
    sendMessage({ type: "SHIELD_CAPTURE_ACTIVE_TAB" }),
  ]);

  if (connectionResponse.status === "fulfilled") {
    state.connection = connectionResponse.value;
    state.connectionError = "";
    state.lastVerdict = connectionResponse.value.lastVerdict ?? null;
  } else {
    state.connection = null;
    state.connectionError =
      connectionResponse.reason?.message || "Unable to read state.";
  }

  if (captureResponse.status === "fulfilled") {
    state.tabContext = captureResponse.value.context;
    fillFromTabContext(state.tabContext, false);
  }

  renderConnection();
  renderTabContext();
  renderVerdict(state.lastVerdict);
}

async function captureTabContext() {
  setStatusNotice("info", "Capturing active tab context...");
  try {
    const response = await sendMessage({ type: "SHIELD_CAPTURE_ACTIVE_TAB" });
    state.tabContext = response.context;
    fillFromTabContext(state.tabContext, true);
    renderTabContext();
    setStatusNotice("success", "Captured the active tab and prefilling the packet.");
  } catch (error) {
    setStatusNotice("error", error instanceof Error ? error.message : "Capture failed.");
  }
}

async function analyzePacket(event) {
  event.preventDefault();
  setStatusNotice("", "");

  try {
    const request = buildRequestPayload();
    state.analyzing = true;
    refs.analyzeButton.disabled = true;
    refs.analyzeButton.textContent = "Analyzing...";

    const response = await sendMessage({
      type: "SHIELD_ANALYZE",
      request,
    });

    state.lastVerdict = response.analysis;
    if (state.connection) {
      state.connection.lastVerdict = response.analysis;
    }
    state.acknowledgement = false;
    renderVerdict(state.lastVerdict);
    renderConnection();
    setStatusNotice("success", "Live verdict received from the Shield API.");
  } catch (error) {
    setStatusNotice("error", error instanceof Error ? error.message : "Analysis failed.");
  } finally {
    state.analyzing = false;
    refs.analyzeButton.disabled = false;
    refs.analyzeButton.textContent = "Analyze action";
  }
}

function handleVerdictClicks(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.getAttribute("data-action");
  if (action !== "ack-warning") {
    return;
  }

  state.acknowledgement = true;
  renderVerdict(state.lastVerdict);
}

function resetPacket() {
  Object.assign(formState, defaultFormState());
  syncInputs();
  setStatusNotice("", "");
}

function handleDemoPacketClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest("[data-demo-index]");
  if (!(button instanceof HTMLElement)) {
    return;
  }

  loadDemoPacket(Number(button.dataset.demoIndex));
}

async function init() {
  refs.subtitle = $("subtitle");
  refs.openSettingsButton = $("openSettingsButton");
  refs.accessBadge = $("accessBadge");
  refs.accessText = $("accessText");
  refs.captureTabButton = $("captureTabButton");
  refs.tabContext = $("tabContext");
  refs.analysisForm = $("analysisForm");
  refs.actionType = $("actionType");
  refs.protocol = $("protocol");
  refs.website = $("website");
  refs.summary = $("summary");
  refs.rawSignals = $("rawSignals");
  refs.assetValueUsd = $("assetValueUsd");
  refs.gasCostUsd = $("gasCostUsd");
  refs.formNotice = $("formNotice");
  refs.analyzeButton = $("analyzeButton");
  refs.resetButton = $("resetButton");
  refs.verdictPanel = $("verdictPanel");
  refs.demoPackets = $("demoPackets");

  refs.analysisForm.addEventListener("submit", analyzePacket);
  refs.captureTabButton.addEventListener("click", captureTabContext);
  refs.resetButton.addEventListener("click", resetPacket);
  refs.demoPackets.addEventListener("click", handleDemoPacketClick);
  refs.openSettingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  refs.verdictPanel.addEventListener("click", handleVerdictClicks);

  refs.actionType.addEventListener("change", () => {
    formState.actionType = refs.actionType.value;
  });
  refs.protocol.addEventListener("input", () => {
    formState.protocol = refs.protocol.value;
  });
  refs.website.addEventListener("input", () => {
    formState.website = refs.website.value;
  });
  refs.summary.addEventListener("input", () => {
    formState.summary = refs.summary.value;
  });
  refs.rawSignals.addEventListener("input", () => {
    formState.rawSignals = refs.rawSignals.value;
  });
  refs.assetValueUsd.addEventListener("input", () => {
    formState.assetValueUsd = refs.assetValueUsd.value;
  });
  refs.gasCostUsd.addEventListener("input", () => {
    formState.gasCostUsd = refs.gasCostUsd.value;
  });

  syncInputs();
  renderDemoPackets();
  await loadInitialState();
}

document.addEventListener("DOMContentLoaded", init);
