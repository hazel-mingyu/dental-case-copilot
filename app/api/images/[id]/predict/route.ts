import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Vision classification is retained only as historical data, not a live product workflow.
export async function POST() {
  return NextResponse.json(
    { ok: false, code: "vision_classification_disabled" },
    { status: 410 }
  )
}
