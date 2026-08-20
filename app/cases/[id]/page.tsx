import Link from "next/link"
import { createServerSupabaseClient } from "../../../lib/server/supabase"
import PhotoTimeline from "./PhotoTimeline"
import CaseSummaryPanel from "./CaseSummaryPanel"
import PptTestButton from "./PptTestButton"
import EditCaseInfo from "./EditCaseInfo"

export const dynamic = "force-dynamic"
function perfNow() { return Number(process.hrtime.bigint()) / 1_000_000 }

export default async function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { id } = await params
  const detailStartedAt = perfNow()
  console.info(`[perf:create-case] CaseDetail data loading start case_id=${id}`)
  const caseQueryStartedAt = perfNow()
  const { data: caseData, error: caseError } = await supabase.from("cases").select("*").eq("id", id).single()
  console.info(`[perf:create-case] cases query end elapsed_ms=${Math.round(perfNow() - caseQueryStartedAt)}`)
  if (caseError || !caseData) return <main className="p-8"><h1 className="text-2xl font-bold">加载失败</h1><p className="mt-3 text-gray-500">{caseError?.message}</p></main>

  const timepointsStartedAt = perfNow(), imagesStartedAt = perfNow(), voiceNotesStartedAt = perfNow()
  const [{ data: timepoints, error: timepointsError }, { data: images, error: imagesError }, { data: voiceNotes, error: voiceNotesError }, { data: savedSummary }] = await Promise.all([
    supabase.from("case_timepoints").select("id,captured_on,completed_at,created_at,is_final,sequence_order").eq("case_id", id).not("completed_at", "is", null).order("sequence_order", { ascending: true }).then((result) => { console.info(`[perf:create-case] case_timepoints query end elapsed_ms=${Math.round(perfNow() - timepointsStartedAt)}`); return result }),
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
  const signedImageUrls = await Promise.all((images ?? []).map(async (image) => {
    const { data, error } = await supabase.storage.from("case-images").createSignedUrl(image.image_path, 3600)
    return { id: image.id, url: data?.signedUrl ?? "", error: error?.message ?? null }
  }))
  const signedImageUrlById = new Map(signedImageUrls.map((image) => [image.id, image.url]))
  const signedImageUrlError = signedImageUrls.find((image) => image.error)?.error ?? null
  const completeBatches = (timepoints ?? []).map((timepoint) => ({
    id: timepoint.id,
    captured_on: timepoint.captured_on,
    completed_at: timepoint.completed_at!,
    voice_notes: (voiceNotes ?? []).filter((note) => note.timepoint_id === timepoint.id),
    images: (images ?? []).filter((image) => image.timepoint_id === timepoint.id).map((image) => ({
      id: image.id,
      image_path: image.image_path,
      url: signedImageUrlById.get(image.id) ?? "",
      view_label: reviewByImageId.get(image.id) ?? null,
    })),
  })).filter((batch) => batch.images.length > 0)
  const completedIds = new Set((timepoints ?? []).map((timepoint) => timepoint.id))
  const legacyImages = (images ?? []).filter((image) => !image.timepoint_id || !completedIds.has(image.timepoint_id)).map((image) => ({
    id: image.id,
    image_path: image.image_path,
    url: signedImageUrlById.get(image.id) ?? "",
    view_label: reviewByImageId.get(image.id) ?? null,
  }))
  const firstRenderedImage = completeBatches.flatMap((batch) => batch.images)[0] ?? legacyImages[0]
  if (process.env.NODE_ENV === "development" && firstRenderedImage) {
    console.info("Case image render diagnostic", {
      has_image_url: Boolean(firstRenderedImage.url),
      source: "signed",
    })
  }
  const isTreatmentEnded = (timepoints ?? []).some((timepoint) => timepoint.is_final === true)
  const latestVisit = completeBatches.length ? completeBatches[completeBatches.length - 1].completed_at : caseData.created_at
  const loadError = timepointsError || imagesError || reviewsError || voiceNotesError || (signedImageUrlError ? { message: "病例图片访问失败，请刷新后重试。" } : null)

  console.info(`[perf:create-case] CaseDetail data loading end elapsed_ms=${Math.round(perfNow() - detailStartedAt)}`)
  return <main className="min-h-screen bg-[#f9faf9] px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1120px]">
    <header className="rounded-lg bg-white px-2 py-1">
    <Link href={caseData.case_type ? `/cases?case_type=${encodeURIComponent(caseData.case_type)}` : "/"} className="inline-flex px-2 py-2 text-sm text-[#597369] transition hover:text-[#0d5940]">← 返回病例库</Link>
    <div className="flex flex-wrap items-center gap-3 px-2 pb-1"><h1 className="text-[30px] font-semibold tracking-tight text-[#212e29]">{caseData.patient_name || "未填写患者姓名"}</h1><span className="rounded-full bg-[#e8f7f0] px-2.5 py-1 text-xs font-medium text-[#0f6b45]">{isTreatmentEnded ? "已结束" : "治疗中"}</span></div>
    <p className="px-2 text-sm text-[#597369]">{caseData.case_code}</p>
    </header>
    <section className="mt-6 rounded-[10px] border border-[#dbe3de] bg-white px-6 py-5"><EditCaseInfo caseId={id} patientName={caseData.patient_name} patientPhone={caseData.patient_phone} birthYear={caseData.birth_year} caseType={caseData.case_type} createdAt={caseData.created_at} latestVisit={latestVisit} isTreatmentEnded={isTreatmentEnded} /></section>
    <CaseSummaryPanel caseId={id} initialSummary={savedSummary?.summary_json ?? null} initialMode={savedSummary?.summary_mode ?? null} />
    <section className="mt-8"><h2 className="px-1 text-lg font-semibold text-[#212e29]">治疗时间线</h2>{loadError ? <p className="mt-4 text-red-600">{loadError.message}</p> : <div className="mt-4"><PhotoTimeline caseId={id} completedBatches={completeBatches} legacyImages={legacyImages} isTreatmentEnded={isTreatmentEnded} hasCaseImages={(images ?? []).length > 0} /></div>}</section>
    <PptTestButton caseId={id} summary={savedSummary?.summary_json ?? null} defaultPptType={isTreatmentEnded ? "case_showcase" : "academic_discussion"} caseType={caseData.case_type} timepoints={completeBatches.map((batch) => ({ id: batch.id, captured_on: batch.captured_on, sequence_order: (timepoints ?? []).find((timepoint) => timepoint.id === batch.id)?.sequence_order ?? 0, images: batch.images }))} />
    </div>
  </main>
}
