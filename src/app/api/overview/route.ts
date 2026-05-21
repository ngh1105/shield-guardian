import { NextResponse } from "next/server";

import { readOverview } from "@/lib/genlayer-client";
import { hasContractAddress } from "@/lib/genlayer/config";

export async function GET() {
  if (!hasContractAddress()) {
    return NextResponse.json(
      {
        error:
          "GenLayer contract is not configured. Set NEXT_PUBLIC_PHASE_B_CONTRACT or GENLAYER_CONTRACT_ADDRESS in .env.local and restart the dev server.",
      },
      { status: 503 },
    );
  }

  try {
    const overview = await readOverview();
    return NextResponse.json({ overview });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Overview read failed.";
    return NextResponse.json(
      {
        error: `GenLayer Studionet read failed: ${message}`,
      },
      { status: 502 },
    );
  }
}
