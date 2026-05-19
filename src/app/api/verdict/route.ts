import { NextResponse } from "next/server";

import { getShieldVerdict } from "@/features/shield/lib/mock-verdict";
import { extractHostname } from "@/features/shield/lib/url-safety";
import type { ShieldVerdictRequest } from "@/features/shield/types";

const ALLOWED_ACTION_TYPES = new Set(["sign", "approve", "bridge", "claim"]);
const DEMO_MODE_HEADER = "x-shield-demo-mode";

function parseUsdNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function shouldUseDemoMode(request: Request) {
  return (
    process.env.SHIELD_ENABLE_DEMO_MODE === "1" &&
    request.headers.get(DEMO_MODE_HEADER) === "1"
  );
}

export async function POST(request: Request) {
  let payload: Partial<ShieldVerdictRequest>;

  try {
    payload = (await request.json()) as Partial<ShieldVerdictRequest>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  if (!payload.actionType || !ALLOWED_ACTION_TYPES.has(payload.actionType)) {
    return NextResponse.json(
      { error: "Unsupported or missing actionType." },
      { status: 400 },
    );
  }

  if (!payload.summary?.trim()) {
    return NextResponse.json(
      { error: "Missing action summary." },
      { status: 400 },
    );
  }

  if (!extractHostname(payload.website ?? "")) {
    return NextResponse.json(
      { error: "Missing or invalid website host." },
      { status: 400 },
    );
  }

  const assetValueUsd = parseUsdNumber(payload.assetValueUsd);
  const gasCostUsd = parseUsdNumber(payload.gasCostUsd);
  if (assetValueUsd === null || gasCostUsd === null) {
    return NextResponse.json(
      { error: "assetValueUsd and gasCostUsd must be non-negative numbers." },
      { status: 400 },
    );
  }

  const normalizedPayload: ShieldVerdictRequest = {
    actionType: payload.actionType,
    protocol: payload.protocol?.trim() ?? "",
    website: payload.website?.trim() ?? "",
    summary: payload.summary?.trim() ?? "",
    rawSignals: payload.rawSignals?.trim() ?? "",
    assetValueUsd,
    gasCostUsd,
  };

  const useDemo = shouldUseDemoMode(request);

  if (!useDemo) {
    return NextResponse.json(
      {
        error:
          "Live verdicts now sign in the browser via the wallet. Send the demo header for mock verdicts, or run the new browser flow.",
      },
      { status: 410 },
    );
  }

  const verdict = getShieldVerdict(normalizedPayload);

  return NextResponse.json({
    request: normalizedPayload,
    verdict,
  });
}
