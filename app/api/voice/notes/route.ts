import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/server/auth"
import { createServerSupabaseClient } from "@/lib/server/supabase"

type Segment = { category?: unknown; content?: unknown; evidence_quote?: unknown; evidence_valid?: unknown; source?: unknown }
function clean(segments: unknown): Segment[] { return Array.isArray(segments) ? segments.filter((item): item is Segment => { const content = item && typeof item === "object" ? (item as Segment).content : undefined; return typeof content === "string" && Boolean(content.trim()) }).map((item) => ({ ...item, content: String(item.content).trim() })) : [] }
function dedupe(segments: Segment[]) { return segments.filter((item, index) => segments.findIndex((other) => other.content === item.content) === index) }
function stamped(transcript: string) { return `[${new Date().toLocaleString("zh-CN", { hour12: false })}]\n${transcript.trim()}` }

export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  } catch {
    console.error("Voice note authentication failed")
    return NextResponse.json({ error: "保存病例记录失败，请稍后重试。" }, { status: 500 })
  }

  try {
    const body = await request.json() as { case_id?: unknown; timepoint_id?: unknown; raw_transcript?: unknown; confirmed_segments?: unknown }
    const incoming = clean(body.confirmed_segments)
    if (typeof body.case_id !== "string" || typeof body.timepoint_id !== "string" || typeof body.raw_transcript !== "string" || !body.raw_transcript.trim()) return NextResponse.json({ error: "病例记录数据不完整。" }, { status: 400 })
    const supabase = await createServerSupabaseClient()
    const { data: caseData, error: caseError } = await supabase.from("cases").select("id").eq("id", body.case_id).maybeSingle()
    if (caseError) { console.error("Voice note case lookup failed"); return NextResponse.json({ error: "保存病例记录失败，请稍后重试。" }, { status: 500 }) }
    if (!caseData) return NextResponse.json({ error: "资源不存在" }, { status: 404 })
    const { data: timepoint, error: timepointError } = await supabase.from("case_timepoints").select("id").eq("id", body.timepoint_id).eq("case_id", body.case_id).maybeSingle()
    if (timepointError) { console.error("Voice note timepoint lookup failed"); return NextResponse.json({ error: "保存病例记录失败，请稍后重试。" }, { status: 500 }) }
    if (!timepoint) return NextResponse.json({ error: "资源不存在" }, { status: 404 })
    if (!incoming.length) return NextResponse.json({ status: "skipped" })
    const { data: existing, error: existingError } = await supabase.from("case_voice_notes").select("id,raw_transcript,confirmed_segments").eq("timepoint_id", body.timepoint_id).order("created_at", { ascending: true }).limit(1).maybeSingle()
    if (existingError) { console.error("Voice note lookup failed"); return NextResponse.json({ error: "保存病例记录失败，请稍后重试。" }, { status: 500 }) }
    if (existing) {
      const merged = dedupe([...clean(existing.confirmed_segments), ...incoming])
      const raw = `${existing.raw_transcript}\n\n${stamped(body.raw_transcript)}`
      const { data, error } = await supabase.from("case_voice_notes").update({ raw_transcript: raw, confirmed_segments: merged, updated_at: new Date().toISOString() }).eq("id", existing.id).select("id,created_at,confirmed_segments").single()
      if (error || !data) return NextResponse.json({ error: "保存病例记录失败，请稍后重试。" }, { status: 500 })
      return NextResponse.json(data)
    }
    const { data, error } = await supabase.from("case_voice_notes").insert({ case_id: body.case_id, timepoint_id: body.timepoint_id, raw_transcript: stamped(body.raw_transcript), confirmed_segments: dedupe(incoming) }).select("id,created_at,confirmed_segments").single()
    if (error || !data) return NextResponse.json({ error: "保存病例记录失败，请稍后重试。" }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    console.error("Voice note save failed")
    return NextResponse.json({ error: "保存病例记录失败，请稍后重试。" }, { status: 500 })
  }
}
