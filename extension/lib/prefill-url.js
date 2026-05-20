// extension/lib/prefill-url.js
const PREFILL_MAX_BYTES = 4096;

function base64UrlEncode(json) {
  const bytes = new TextEncoder().encode(json);
  let base64;
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildPrefillUrl(packet, apiBaseUrl) {
  const base = apiBaseUrl?.replace(/\/+$/, "") || "http://localhost:3000";
  try {
    const json = JSON.stringify(packet);
    if (json.length > PREFILL_MAX_BYTES) return `${base}/`;
    const encoded = base64UrlEncode(json);
    return `${base}/?prefill=${encoded}`;
  } catch {
    return `${base}/`;
  }
}
