import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/server/supabase"

export const dynamic = "force-dynamic"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await createServerSupabaseClient().from("case_voice_notes").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "删除病例记录失败，请重试。" }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json() as { confirmed_segments?: unknown }
  const segments = Array.isArray(body.confirmed_segments) ? body.confirmed_segments.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).content === "string" && String((item as Record<string, unknown>).content).trim())).map((item) => ({ ...item, content: String(item.content).trim() })) : []
  const supabase = createServerSupabaseClient()
  if (!segments.length) { const { error } = await supabase.from("case_voice_notes").delete().eq("id", id); return error ? NextResponse.json({ error: "删除病例记录失败，请重试。" }, { status: 500 }) : new NextResponse(null, { status: 204 }) }
  const { error } = await supabase.from("case_voice_notes").update({ confirmed_segments: segments, updated_at: new Date().toISOString() }).eq("id", id)
  return error ? NextResponse.json({ error: "保存修改失败，请重试。" }, { status: 500 }) : NextResponse.json({ ok: true })
}
