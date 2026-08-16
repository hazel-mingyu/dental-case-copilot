import { NextResponse } from "next/server"
import { transcribeVoice, VoiceServiceError } from "@/lib/server/voice"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const audio = formData.get("audio")
    if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "请选择有效的录音文件。" }, { status: 400 })
    if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "录音文件过大，请控制在 25MB 以内。" }, { status: 413 })
    const result = await transcribeVoice(new Uint8Array(await audio.arrayBuffer()), audio.type)
    return NextResponse.json(result)
  } catch (error) {
    const status = error instanceof VoiceServiceError ? error.status : 500
    const message = error instanceof VoiceServiceError && error.code === "credential_missing"
      ? "语音服务配置未完成，请联系管理员。"
      : "语音识别失败，请检查网络后重试。"
    return NextResponse.json({ error: message }, { status })
  }
}
