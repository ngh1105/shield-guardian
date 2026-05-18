import { NextResponse } from "next/server";

import { readOverview } from "@/lib/genlayer-client";

export async function GET() {
  if (!process.env.GENLAYER_CONTRACT_ADDRESS?.trim()) {
    return NextResponse.json(
      { error: "GenLayer contract is not configured." },
      { status: 503 },
    );
  }

  try {
    const overview = await readOverview();
    return NextResponse.json({ overview });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Overview read failed.",
      },
      { status: 502 },
    );
  }
}
