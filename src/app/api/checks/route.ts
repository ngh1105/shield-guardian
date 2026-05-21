import { NextResponse } from "next/server";

import { readChecksFor } from "@/lib/genlayer-client";
import { hasContractAddress } from "@/lib/genlayer/config";

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  if (!hasContractAddress()) {
    return NextResponse.json(
      {
        error:
          "GenLayer contract is not configured. Set NEXT_PUBLIC_PHASE_B_CONTRACT or GENLAYER_CONTRACT_ADDRESS in .env.local and restart the dev server.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  const limitRaw = url.searchParams.get("limit");

  if (!address || !ETH_ADDRESS_REGEX.test(address)) {
    return NextResponse.json(
      { error: "Invalid or missing address." },
      { status: 400 },
    );
  }

  const limitNumber = Number(limitRaw ?? 20);
  if (!Number.isFinite(limitNumber)) {
    return NextResponse.json(
      { error: "Invalid limit." },
      { status: 400 },
    );
  }
  const limit = Math.min(Math.max(limitNumber, 1), 50);

  try {
    const checks = await readChecksFor(address, limit);
    return NextResponse.json({ checks });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Checks read failed.";
    return NextResponse.json(
      {
        error: `GenLayer Studionet read failed: ${message}`,
      },
      { status: 502 },
    );
  }
}
