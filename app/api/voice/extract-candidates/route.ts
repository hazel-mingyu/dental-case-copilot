import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/server/auth"
import { extractVoiceCandidates } from "@/lib/server/voice"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  } catch {
    console.error("Voice candidate extraction authentication failed")
    return NextResponse.json({ error: "病例信息整理失败，请稍后重试。" }, { status: 500 })
  }

  try {
    const body = await request.json() as { transcript?: unknown }
    if (typeof body.transcript !== "string" || !body.transcript.trim()) return NextResponse.json({ error: "请先提供有效的语音转写内容。" }, { status: 400 })
    const transcript = body.transcript.trim()
    if (transcript.length > 20_000) return NextResponse.json({ error: "语音转写内容过长，请控制在 20000 字符以内。" }, { status: 413 })
    return NextResponse.json(await extractVoiceCandidates(transcript))
  } catch (error) {
    console.error("Voice candidate extraction failed", { errorName: error instanceof Error ? error.name : "unknown" })
    return NextResponse.json({ error: "病例信息整理失败，请稍后重试。" }, { status: 500 })
  }
}
