import { NextResponse } from "next/server";

import { getShieldVerdict } from "@/features/shield/lib/mock-verdict";
import { extractHostname } from "@/features/shield/lib/url-safety";
import type { ShieldVerdictRequest } from "@/features/shield/types";
import { submitVerdictRequest } from "@/lib/genlayer-client";

const ALLOWED_ACTION_TYPES = new Set(["sign", "approve", "bridge", "claim"]);
const DEMO_MODE_HEADER = "x-shield-demo-mode";
const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

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

  const rawClaimedRequester = (payload as { claimedRequester?: unknown })
    .claimedRequester;
  let claimedRequester: string | undefined;
  if (
    rawClaimedRequester !== undefined &&
    rawClaimedRequester !== null &&
    rawClaimedRequester !== ""
  ) {
    if (
      typeof rawClaimedRequester !== "string" ||
      !ETH_ADDRESS_REGEX.test(rawClaimedRequester)
    ) {
      return NextResponse.json(
        { error: "Invalid claimedRequester address." },
        { status: 400 },
      );
    }
    claimedRequester = rawClaimedRequester;
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

  let verdict;

  try {
    verdict = shouldUseDemoMode(request)
      ? getShieldVerdict(normalizedPayload)
      : await submitVerdictRequest(normalizedPayload, { claimedRequester });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("GENLAYER_CONTRACT_ADDRESS is not set")
    ) {
      verdict = getShieldVerdict(normalizedPayload);
    } else {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "GenLayer request failed.",
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    request: normalizedPayload,
    verdict,
  });
}
