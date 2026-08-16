import Link from "next/link"
import { supabase } from "../../../lib/supabase"
import { getCaseTypeLabel } from "../../../lib/caseType"
import PhotoTimeline from "./PhotoTimeline"
import CaseSummaryPanel from "./CaseSummaryPanel"

export const dynamic = "force-dynamic"
function perfNow() { return Number(process.hrtime.bigint()) / 1_000_000 }

function maskPhone(phone: string | null) {
  if (!phone) return "未填写"
  return phone.length <= 7 ? `${phone.slice(0, 3)}****` : `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function getAge(birthYear: number | null) {
  return birthYear ? `${new Date().getFullYear() - birthYear} 岁` : "未填写"
}

export default async function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detailStartedAt = perfNow()
  console.info(`[perf:create-case] CaseDetail data loading start case_id=${id}`)
  const caseQueryStartedAt = perfNow()
  const { data: caseData, error: caseError } = await supabase.from("cases").select("*").eq("id", id).single()
  console.info(`[perf:create-case] cases query end elapsed_ms=${Math.round(perfNow() - caseQueryStartedAt)}`)
  if (caseError || !caseData) return <main className="p-8"><h1 className="text-2xl font-bold">加载失败</h1><p className="mt-3 text-gray-500">{caseError?.message}</p></main>

  const timepointsStartedAt = perfNow(), imagesStartedAt = perfNow(), voiceNotesStartedAt = perfNow()
  const [{ data: timepoints, error: timepointsError }, { data: images, error: imagesError }, { data: voiceNotes, error: voiceNotesError }, { data: savedSummary }] = await Promise.all([
    supabase.from("case_timepoints").select("id,captured_on,completed_at,created_at,is_final").eq("case_id", id).not("completed_at", "is", null).order("completed_at", { ascending: true }).then((result) => { console.info(`[perf:create-case] case_timepoints query end elapsed_ms=${Math.round(perfNow() - timepointsStartedAt)}`); return result }),
    supabase.from("case_images").select("id,image_path,timepoint_id").eq("case_id", id).then((result) => { console.info(`[perf:create-case] case_images query end elapsed_ms=${Math.round(perfNow() - imagesStartedAt)}`); return result }),
    supabase.from("case_voice_notes").select("id,timepoint_id,created_at,confirmed_segments").eq("case_id", id).order("created_at", { ascending: true }).then((result) => { console.info(`[perf:create-case] case_voice_notes query end elapsed_ms=${Math.round(perfNow() - voiceNotesStartedAt)}`); return result }),
    supabase.from("case_summaries").select("summary_mode,summary_json").eq("case_id", id).maybeSingle(),
  ])
  const imageIds = (images ?? []).map((image) => image.id)
  const reviewsStartedAt = perfNow()
  const { data: reviews, error: reviewsError } = imageIds.length
    ? await supabase.from("image_reviews").select("image_id,view_label").in("image_id", imageIds)
    : { data: [], error: null }
  console.info(`[perf:create-case] image_reviews query end elapsed_ms=${Math.round(perfNow() - reviewsStartedAt)}`)
  const reviewByImageId = new Map((reviews ?? []).map((review) => [review.image_id, review.view_label]))
  const completeBatches = (timepoints ?? []).map((timepoint) => ({
    id: timepoint.id,
    captured_on: timepoint.captured_on,
    completed_at: timepoint.completed_at!,
    voice_notes: (voiceNotes ?? []).filter((note) => note.timepoint_id === timepoint.id),
    images: (images ?? []).filter((image) => image.timepoint_id === timepoint.id).map((image) => ({
      id: image.id,
      image_path: image.image_path,
      url: supabase.storage.from("case-images").getPublicUrl(image.image_path).data.publicUrl,
      view_label: reviewByImageId.get(image.id) ?? null,
    })),
  })).filter((batch) => batch.images.length > 0)
  const completedIds = new Set((timepoints ?? []).map((timepoint) => timepoint.id))
  const legacyImages = (images ?? []).filter((image) => !image.timepoint_id || !completedIds.has(image.timepoint_id)).map((image) => ({
    id: image.id,
    image_path: image.image_path,
    url: supabase.storage.from("case-images").getPublicUrl(image.image_path).data.publicUrl,
    view_label: reviewByImageId.get(image.id) ?? null,
  }))
  const isTreatmentEnded = (timepoints ?? []).some((timepoint) => timepoint.is_final === true)
  const latestVisit = completeBatches.length ? completeBatches[completeBatches.length - 1].completed_at : caseData.created_at
  const loadError = timepointsError || imagesError || reviewsError || voiceNotesError

  console.info(`[perf:create-case] CaseDetail data loading end elapsed_ms=${Math.round(perfNow() - detailStartedAt)}`)
  return <main className="p-8">
    <Link href={caseData.case_type ? `/cases?case_type=${encodeURIComponent(caseData.case_type)}` : "/"} className="text-sm text-gray-500 hover:text-black">← 返回病例库</Link>
    <h1 className="mt-6 text-3xl font-bold">{caseData.case_code}</h1>
    <section className="mt-6 rounded-xl border bg-white p-6">
      <p className="text-xl font-semibold">{caseData.patient_name || "未填写患者姓名"}</p>
      <dl className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
        <div><dt className="text-gray-400">电话</dt><dd>{maskPhone(caseData.patient_phone)}</dd></div>
        <div><dt className="text-gray-400">出生年份</dt><dd>{caseData.birth_year || "未填写"}</dd></div>
        <div><dt className="text-gray-400">当前年龄</dt><dd>{getAge(caseData.birth_year)}</dd></div>
        <div><dt className="text-gray-400">治疗类型</dt><dd>{getCaseTypeLabel(caseData.case_type)}</dd></div>
        <div><dt className="text-gray-400">首次就诊</dt><dd>{new Date(caseData.created_at).toLocaleString("zh-CN")}</dd></div>
        <div><dt className="text-gray-400">最近就诊</dt><dd>{new Date(latestVisit).toLocaleString("zh-CN")}</dd></div>
      </dl>
    </section>
    <section className="mt-8"><h2 className="text-xl font-semibold">病例照片</h2>{loadError ? <p className="mt-4 text-red-600">{loadError.message}</p> : <div className="mt-4"><PhotoTimeline caseId={id} completedBatches={completeBatches} legacyImages={legacyImages} isTreatmentEnded={isTreatmentEnded} hasCaseImages={(images ?? []).length > 0} /></div>}</section>
    <CaseSummaryPanel caseId={id} initialSummary={savedSummary?.summary_json ?? null} initialMode={savedSummary?.summary_mode ?? null} />
  </main>
}
