import { NextResponse } from "next/server"
import { extractVoiceCandidates, VoiceServiceError } from "@/lib/server/voice"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json() as { transcript?: unknown }
    if (typeof body.transcript !== "string" || !body.transcript.trim()) return NextResponse.json({ error: "请先提供有效的语音转写内容。" }, { status: 400 })
    return NextResponse.json(await extractVoiceCandidates(body.transcript.trim()))
  } catch (error) {
    const status = error instanceof VoiceServiceError ? error.status : 500
    const message = error instanceof VoiceServiceError && error.code === "transcript_empty"
      ? "请先提供有效的语音转写内容。"
      : error instanceof VoiceServiceError && error.code === "credential_missing"
        ? "语音服务配置未完成，请联系管理员。"
        : "病例信息整理失败，请稍后重试。"
    return NextResponse.json({ error: message }, { status })
  }
}
