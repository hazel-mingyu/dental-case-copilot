import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/server/auth"
import { createServerSupabaseClient } from "@/lib/server/supabase"

export const dynamic = "force-dynamic"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  } catch {
    console.error("Voice note deletion authentication failed")
    return NextResponse.json({ error: "删除病例记录失败，请稍后重试。" }, { status: 500 })
  }

  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: note, error: noteError } = await supabase.from("case_voice_notes").select("id").eq("id", id).maybeSingle()
    if (noteError) { console.error("Voice note deletion lookup failed"); return NextResponse.json({ error: "删除病例记录失败，请稍后重试。" }, { status: 500 }) }
    if (!note) return NextResponse.json({ error: "资源不存在" }, { status: 404 })
    const { error } = await supabase.from("case_voice_notes").delete().eq("id", id)
    if (error) return NextResponse.json({ error: "删除病例记录失败，请稍后重试。" }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch {
    console.error("Voice note deletion failed")
    return NextResponse.json({ error: "删除病例记录失败，请稍后重试。" }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  } catch {
    console.error("Voice note update authentication failed")
    return NextResponse.json({ error: "保存修改失败，请稍后重试。" }, { status: 500 })
  }

  try {
    const { id } = await params
    const body = await request.json() as { confirmed_segments?: unknown }
    const segments = Array.isArray(body.confirmed_segments) ? body.confirmed_segments.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).content === "string" && String((item as Record<string, unknown>).content).trim())).map((item) => ({ ...item, content: String(item.content).trim() })) : []
    const supabase = await createServerSupabaseClient()
    const { data: note, error: noteError } = await supabase.from("case_voice_notes").select("id").eq("id", id).maybeSingle()
    if (noteError) { console.error("Voice note update lookup failed"); return NextResponse.json({ error: "保存修改失败，请稍后重试。" }, { status: 500 }) }
    if (!note) return NextResponse.json({ error: "资源不存在" }, { status: 404 })
    if (!segments.length) { const { error } = await supabase.from("case_voice_notes").delete().eq("id", id); return error ? NextResponse.json({ error: "删除病例记录失败，请稍后重试。" }, { status: 500 }) : new NextResponse(null, { status: 204 }) }
    const { error } = await supabase.from("case_voice_notes").update({ confirmed_segments: segments, updated_at: new Date().toISOString() }).eq("id", id)
    return error ? NextResponse.json({ error: "保存修改失败，请稍后重试。" }, { status: 500 }) : NextResponse.json({ ok: true })
  } catch {
    console.error("Voice note update failed")
    return NextResponse.json({ error: "保存修改失败，请稍后重试。" }, { status: 500 })
  }
}
