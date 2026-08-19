import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/server/auth"
import { transcribeVoice } from "@/lib/server/voice"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  } catch {
    console.error("Voice transcription authentication failed")
    return NextResponse.json({ error: "语音识别失败，请稍后重试。" }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const audio = formData.get("audio")
    if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "请选择有效的录音文件。" }, { status: 400 })
    if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "录音文件过大，请控制在 25MB 以内。" }, { status: 413 })
    if (audio.type !== "audio/webm" && !audio.type.startsWith("audio/webm;")) return NextResponse.json({ error: "仅支持 WebM 录音文件。" }, { status: 415 })
    const result = await transcribeVoice(new Uint8Array(await audio.arrayBuffer()), audio.type)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Voice transcription failed", { errorName: error instanceof Error ? error.name : "unknown" })
    return NextResponse.json({ error: "语音识别失败，请稍后重试。" }, { status: 500 })
  }
}
