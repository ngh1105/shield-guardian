/* global chrome */

import { buildPrefillUrl } from "../lib/prefill-url.js";
import { getPending } from "../lib/intercept-store.js";
import { normalizeApiBaseUrl, readSettings } from "../shared.js";

const params = new URLSearchParams(location.search);
const nonce = params.get("nonce") ?? "";
const root = document.getElementById("overlayRoot");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendDecision(choice) {
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "SHIELD_OVERLAY_DECISION",
      nonce,
      choice,
    });
  } catch (error) {
    renderRoutingError(error?.message ?? String(error));
    return;
  }
  if (!response?.ok) {
    renderRoutingError(response?.error ?? "Shield Guardian could not deliver the decision.");
  }
}

function renderRoutingError(message) {
  root.classList.remove("tone-safe");
  root.innerHTML = `
    <section class="overlay-panel unavailable">
      <p class="eyebrow">Shield Guardian</p>
      <h1>Decision not delivered</h1>
      <p class="muted">${escapeHtml(message)}</p>
      <p class="muted">Reload this tab to abort the pending wallet action.</p>
    </section>
  `;
}

async function openInWebApp(packet) {
  const settings = await readSettings();
  const apiBase = normalizeApiBaseUrl(settings.apiBaseUrl);
  const url = buildPrefillUrl(packet, apiBase);
  await chrome.tabs.create({ url });
}

function renderUnavailable(packet) {
  root.classList.remove("tone-safe");
  root.innerHTML = `
    <section class="overlay-panel unavailable">
      <p class="eyebrow">Shield Guardian</p>
      <h1>Verdict unavailable</h1>
      <p class="muted">The Shield API did not return a verdict. Review the action below.</p>
      <div class="summary-block">${escapeHtml(packet?.summary ?? "")}</div>
      <div class="button-row">
        <button class="ghost" data-action="open">Open in Shield Guardian</button>
        <button class="secondary" data-action="proceed">Proceed</button>
        <button class="danger" data-action="cancel" autofocus>Cancel</button>
      </div>
    </section>
  `;
}

function renderSafe(packet, verdict) {
  root.classList.add("tone-safe");
  root.innerHTML = `
    <section class="overlay-panel safe-pill">
      <strong>SAFE</strong>
      <span class="muted">${escapeHtml(packet?.summary ?? "")}</span>
      <span class="countdown" id="countdown">2</span>
      <button class="ghost" data-action="hold">Hold</button>
    </section>
  `;
  let remaining = 2;
  const span = document.getElementById("countdown");
  const interval = setInterval(() => {
    remaining -= 1;
    if (span) span.textContent = String(remaining);
    if (remaining <= 0) {
      clearInterval(interval);
      sendDecision("proceed");
    }
  }, 1000);
  root.querySelector('[data-action="hold"]').addEventListener("click", () => {
    clearInterval(interval);
    renderModal(packet, verdict, "weird");
  });
}

function renderModal(packet, verdict, tone) {
  root.classList.remove("tone-safe");
  const reasons = (verdict?.reasons ?? []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  root.innerHTML = `
    <section class="overlay-panel ${tone}">
      <p class="eyebrow">Shield Guardian</p>
      <h1>${tone === "dangerous" ? "Dangerous" : "Warning"}</h1>
      <div class="summary-block">${escapeHtml(packet?.summary ?? "")}</div>
      <ul class="reasons">${reasons}</ul>
      <div class="button-row">
        <button class="ghost" data-action="open">Open in Shield Guardian</button>
        ${tone === "dangerous"
          ? '<button class="secondary hidden" data-action="proceed" id="proceedBtn">Proceed despite warning</button><button class="ghost" data-action="reveal">Show override</button>'
          : '<button class="secondary" data-action="proceed">Proceed</button>'}
        <button class="danger" data-action="cancel" autofocus>Cancel</button>
      </div>
    </section>
  `;

  if (tone === "dangerous") {
    root.querySelector('[data-action="reveal"]').addEventListener("click", (e) => {
      e.target.classList.add("hidden");
      const proceed = document.getElementById("proceedBtn");
      if (proceed) proceed.classList.remove("hidden");
    });
  }
}

function attachActions(packet) {
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    if (action === "proceed") sendDecision("proceed");
    else if (action === "cancel") sendDecision("cancel");
    else if (action === "open") openInWebApp(packet);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") sendDecision("cancel");
  });
}

async function main() {
  if (!nonce) {
    renderUnavailable(null);
    attachActions(null);
    return;
  }
  const entry = await getPending(nonce);
  const packet = entry?.packet ?? null;
  const verdict = entry?.verdict ?? null;

  if (!verdict) {
    renderUnavailable(packet);
  } else if (verdict.verdict === "SAFE") {
    renderSafe(packet, verdict);
  } else if (verdict.verdict === "DANGEROUS") {
    renderModal(packet, verdict, "dangerous");
  } else {
    renderModal(packet, verdict, "weird");
  }

  attachActions(packet);
}

main();
