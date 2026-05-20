// extension/lib/intercept-store.js
/* global chrome */

const PENDING_KEY = "shieldGuardian.pendingIntercepts";
const RECENT_KEY = "shieldGuardian.recentIntercepts";
const MAX_RECENT = 10;
const PENDING_TTL_MS = 30_000;

async function readSession(key) {
  const result = await chrome.storage.session.get(key);
  return result[key];
}

async function writeSession(key, value) {
  await chrome.storage.session.set({ [key]: value });
}

export async function setPending(nonce, payload) {
  const map = (await readSession(PENDING_KEY)) ?? {};
  map[nonce] = { ...payload, createdAt: Date.now() };
  await writeSession(PENDING_KEY, map);
}

export async function getPending(nonce) {
  const map = (await readSession(PENDING_KEY)) ?? {};
  const entry = map[nonce];
  if (!entry) return null;
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) {
    delete map[nonce];
    await writeSession(PENDING_KEY, map);
    return null;
  }
  return entry;
}

export async function clearPending(nonce) {
  const map = (await readSession(PENDING_KEY)) ?? {};
  delete map[nonce];
  await writeSession(PENDING_KEY, map);
}

export async function pushRecent(record) {
  const list = (await readSession(RECENT_KEY)) ?? [];
  const trimmed = [record, ...list].slice(0, MAX_RECENT);
  await writeSession(RECENT_KEY, trimmed);
}

export async function readRecent() {
  return (await readSession(RECENT_KEY)) ?? [];
}
