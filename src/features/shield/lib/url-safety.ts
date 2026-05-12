export const EXACT_TRUSTED_HOSTS = [
  "app.uniswap.org",
  "app.aave.com",
  "base.org",
  "arbitrum.io",
  "jumper.exchange",
  "app.safe.global",
] as const;

export function extractHostname(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;

  try {
    const hostname = new URL(candidate).hostname.toLowerCase().replace(/\.$/, "");
    return hostname || null;
  } catch {
    return null;
  }
}

export function isTrustedHost(value: string): boolean {
  const hostname = extractHostname(value);
  return hostname
    ? EXACT_TRUSTED_HOSTS.some((trustedHost) => trustedHost === hostname)
    : false;
}
