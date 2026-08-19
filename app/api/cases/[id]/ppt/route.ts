import { NextResponse } from "next/server"
import PptxGenJS from "pptxgenjs"
import imageSize from "image-size"
import { createServerSupabaseClient } from "../../../../../lib/server/supabase"

export const dynamic = "force-dynamic"

const RIGHT_BUCCAL = "intraoral_right_buccal"
const FRONTAL = "intraoral_frontal"
const LEFT_BUCCAL = "intraoral_left_buccal"
const MAXILLARY_OCCLUSAL = "intraoral_maxillary_occlusal"
const MANDIBULAR_OCCLUSAL = "intraoral_mandibular_occlusal"
const STANDARD_3_ORDER = [RIGHT_BUCCAL, FRONTAL, LEFT_BUCCAL]
const STANDARD_5_ORDER = [MAXILLARY_OCCLUSAL, RIGHT_BUCCAL, FRONTAL, LEFT_BUCCAL, MANDIBULAR_OCCLUSAL]
const INTRAORAL_IMAGE_W = 2.37
const INTRAORAL_IMAGE_H = 1.46
const INTRAORAL_IMAGE_W_DENSE_8 = 1.783
const INTRAORAL_IMAGE_H_DENSE_8 = 1.102
const INTRAORAL_GAP_X = 0.1
const INTRAORAL_GAP_Y = 0.12
const VISUAL = {
  marginX: 0.52,
  headerY: 0.38,
  contentY: 1.12,
  contentH: 5.86,
  imageW: 7.32,
  columnGap: 0.32,
  sectionGap: 0.24,
  accent: "5B8A72",
  text: "1E2923",
  body: "3A4740",
  divider: "DCE7E0",
} as const
type LayoutType = "intraoral_standard_3" | "intraoral_standard_5" | "anterior_aesthetics_comparison"
type PptType = "case_showcase" | "academic_discussion"
type SelectedTimepoint = { timepoint_id?: string; selected_image_ids?: string[] }
type RequestBody = {
  case_id?: string
  timepoint_id?: string
  selected_image_ids?: string[]
  selected_timepoints?: SelectedTimepoint[]
  selected_summary?: { current_status?: string[]; treatment_progress?: string[]; final_status?: string[] }
  discussion_question?: string
  ppt_type?: string
}
type Fact = { content?: unknown }
type Summary = Record<string, unknown>
type Photo = { data: string; mime: string; width: number; height: number }
type IntraoralImageSize = { w: number; h: number }
type MatchedTimepoint = {
  id: string
  captured_on: string | null
  sequence_order: number
  layoutType: LayoutType
  images: { id: string; image_path: string; view_label: string; photo: Photo }[]
}

class RequestValidationError extends Error {}

function errorResponse(message: string, status = 400) { return NextResponse.json({ error: message }, { status }) }
function timepointTitle(timepoint: { sequence_order: number; captured_on: string | null }) { return `时间点 ${timepoint.sequence_order}${timepoint.captured_on ? ` · ${timepoint.captured_on.slice(0, 10)}` : ""}` }
function facts(summary: Summary | null, keys: string[]) {
  if (!summary) return []
  for (const key of keys) {
    const value = summary[key]
    if (!Array.isArray(value)) continue
    const result = value.map((item: Fact) => typeof item?.content === "string" ? item.content.trim() : "").filter(Boolean).slice(0, 3)
    if (result.length) return result
  }
  return []
}
function selectedFacts(selected: unknown, allowed: string[]) {
  if (selected === undefined) return []
  if (!Array.isArray(selected)) throw new RequestValidationError("病例总结选择格式无效")
  const values = [...new Set(selected.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))]
  if (values.length > 3) throw new RequestValidationError("每个病例总结区域最多选择 3 条")
  if (values.some((value) => !allowed.includes(value))) throw new RequestValidationError("所选病例总结条目不属于当前病例")
  return values
}
function containBox(width: number, height: number, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / width, h / height), fittedW = width * scale, fittedH = height * scale
  return { x: x + (w - fittedW) / 2, y: y + (h - fittedH) / 2, w: fittedW, h: fittedH }
}
function addPhoto(slide: PptxGenJS.Slide, photo: Photo, x: number, y: number, w: number, h: number) {
  slide.addImage({ data: `data:${photo.mime};base64,${photo.data}`, ...containBox(photo.width, photo.height, x, y, w, h) })
}
function addIntraoralThree(slide: PptxGenJS.Slide, imageByView: Map<string, MatchedTimepoint["images"][number]>, x: number, y: number, w: number, h: number, imageSize: IntraoralImageSize) {
  const groupW = imageSize.w * 3 + INTRAORAL_GAP_X * 2
  const startX = x + (w - groupW) / 2, startY = y + (h - imageSize.h) / 2
  STANDARD_3_ORDER.forEach((view, index) => {
    const image = imageByView.get(view)
    if (image) addPhoto(slide, image.photo, startX + index * (imageSize.w + INTRAORAL_GAP_X), startY, imageSize.w, imageSize.h)
  })
}
function addIntraoralFive(slide: PptxGenJS.Slide, imageByView: Map<string, MatchedTimepoint["images"][number]>, x: number, y: number, w: number, h: number, imageSize: IntraoralImageSize) {
  const groupW = imageSize.w * 3 + INTRAORAL_GAP_X * 2
  const groupH = imageSize.h * 3 + INTRAORAL_GAP_Y * 2
  const startX = x + (w - groupW) / 2, startY = y + (h - groupH) / 2, centeredX = startX + imageSize.w + INTRAORAL_GAP_X
  const positions: Record<string, { x: number; y: number; w: number; h: number }> = {
    [MAXILLARY_OCCLUSAL]: { x: centeredX, y: startY, w: imageSize.w, h: imageSize.h },
    [RIGHT_BUCCAL]: { x: startX, y: startY + imageSize.h + INTRAORAL_GAP_Y, w: imageSize.w, h: imageSize.h },
    [FRONTAL]: { x: centeredX, y: startY + imageSize.h + INTRAORAL_GAP_Y, w: imageSize.w, h: imageSize.h },
    [LEFT_BUCCAL]: { x: startX + (imageSize.w + INTRAORAL_GAP_X) * 2, y: startY + imageSize.h + INTRAORAL_GAP_Y, w: imageSize.w, h: imageSize.h },
    [MANDIBULAR_OCCLUSAL]: { x: centeredX, y: startY + (imageSize.h + INTRAORAL_GAP_Y) * 2, w: imageSize.w, h: imageSize.h },
  }
  STANDARD_5_ORDER.forEach((view) => {
    const image = imageByView.get(view), position = positions[view]
    if (image) addPhoto(slide, image.photo, position.x, position.y, position.w, position.h)
  })
}
function textHeight(content: string, width: number, maxHeight = 1.8) {
  const charactersPerLine = Math.max(24, Math.floor(width * 8))
  return Math.min(maxHeight, Math.max(0.42, Math.ceil(content.length / charactersPerLine) * 0.27 + 0.1))
}
function addFactSection(slide: PptxGenJS.Slide, title: string, values: string[], x: number, y: number, w: number) {
  if (!values.length) return y
  const content = values.map((value) => `• ${value}`).join("\n")
  const bodyH = textHeight(content, w)
  slide.addText(title, { x, y, w, h: 0.3, fontFace: "Microsoft YaHei", fontSize: 14, bold: true, color: VISUAL.text, margin: 0 })
  slide.addText(content, { x, y: y + 0.38, w, h: bodyH, fontFace: "Microsoft YaHei", fontSize: 10.5, color: VISUAL.body, breakLine: false, fit: "shrink", valign: "top", margin: 0 })
  return y + 0.38 + bodyH
}
function addInfoColumn(slide: PptxGenJS.Slide, sections: { title: string; values: string[] }[], x: number, y: number, w: number) {
  const visible = sections.filter((section) => section.values.length)
  let cursor = y
  visible.forEach((section, index) => {
    cursor = addFactSection(slide, section.title, section.values, x, cursor, w)
    if (index < visible.length - 1) {
      const dividerY = cursor + 0.1
      slide.addShape("line", { x, y: dividerY, w, h: 0, line: { color: VISUAL.divider, width: 0.45 } })
      cursor = dividerY + VISUAL.sectionGap
    }
  })
}
async function fetchPhoto(url: string): Promise<Photo> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("图片读取失败")
  const buffer = Buffer.from(await response.arrayBuffer()), dimensions = imageSize(buffer)
  if (!dimensions.width || !dimensions.height) throw new Error("图片尺寸读取失败")
  return { data: buffer.toString("base64"), mime: response.headers.get("content-type") || "image/jpeg", width: dimensions.width, height: dimensions.height }
}
function requestTimepoints(body: RequestBody) {
  const selected = body.selected_timepoints ?? (body.timepoint_id ? [{ timepoint_id: body.timepoint_id, selected_image_ids: body.selected_image_ids }] : null)
  if (!Array.isArray(selected) || !selected.length) throw new RequestValidationError("请选择 1 至 3 个已完成时间点")
  if (selected.length > 3) throw new RequestValidationError("最多选择 3 个已完成时间点")
  const timepointIds = new Set<string>(), imageIds = new Set<string>()
  let imageCount = 0
  const normalized = selected.map((item) => {
    if (!item?.timepoint_id) throw new RequestValidationError("时间点选择无效")
    if (timepointIds.has(item.timepoint_id)) throw new RequestValidationError("同一时间点不能重复选择")
    timepointIds.add(item.timepoint_id)
    if (!Array.isArray(item.selected_image_ids) || !item.selected_image_ids.length) throw new RequestValidationError("每个时间点至少选择一张照片")
    const ids = [...new Set(item.selected_image_ids.filter((imageId): imageId is string => typeof imageId === "string" && Boolean(imageId)))]
    if (ids.length !== item.selected_image_ids.length) throw new RequestValidationError("同一照片不能重复选择")
    if (ids.length > 6) throw new RequestValidationError("每个时间点最多选择 6 张照片")
    for (const imageId of ids) {
      if (imageIds.has(imageId)) throw new RequestValidationError("同一照片不能跨时间点重复选择")
      imageIds.add(imageId)
    }
    imageCount += ids.length
    return { timepoint_id: item.timepoint_id, selected_image_ids: ids }
  })
  if (imageCount > 10) throw new RequestValidationError("最多选择 10 张照片")
  return normalized
}
function addMultiTimepointPhotos(slide: PptxGenJS.Slide, timepoints: MatchedTimepoint[], x: number, y: number, w: number, h: number, imageSize: IntraoralImageSize) {
  const gap = 0.18, groupH = (h - gap * (timepoints.length - 1)) / timepoints.length
  for (const [index, timepoint] of timepoints.entries()) {
    const groupY = y + index * (groupH + gap), headerH = 0.2, contentY = groupY + headerH + 0.08, contentH = groupH - headerH - 0.08
    slide.addText(timepointTitle(timepoint), { x, y: groupY, w, h: headerH, fontFace: "Microsoft YaHei", fontSize: 9.5, bold: true, color: VISUAL.accent, margin: 0 })
    const byView = new Map(timepoint.images.map((image) => [image.view_label, image]))
    const requiredH = timepoint.layoutType === "intraoral_standard_5" ? imageSize.h * 3 + INTRAORAL_GAP_Y * 2 : imageSize.h
    const requiredW = imageSize.w * 3 + INTRAORAL_GAP_X * 2
    if (requiredW > w || requiredH > contentH) console.warn("fixed-size multi-timepoint overflow")
    if (timepoint.layoutType === "intraoral_standard_3") {
      addIntraoralThree(slide, byView, x, contentY, w, contentH, imageSize)
    } else addIntraoralFive(slide, byView, x, contentY, w, contentH, imageSize)
  }
}
function addAnteriorComparison(slide: PptxGenJS.Slide, timepoints: MatchedTimepoint[], x: number, y: number, w: number, h: number) {
  const gap = 0.22, photoW = (w - gap) / 2, photoY = y + 0.34, photoH = h - 0.34
  timepoints.forEach((timepoint, index) => { slide.addText(index === 0 ? "治疗前" : "治疗后", { x: x + index * (photoW + gap), y, w: photoW, h: 0.22, fontFace: "Microsoft YaHei", fontSize: 11, bold: true, color: VISUAL.accent, margin: 0 }); addPhoto(slide, timepoint.images[0].photo, x + index * (photoW + gap), photoY, photoW, photoH) })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: RequestBody = {}
  try { body = await request.json() } catch { return errorResponse("请求格式无效") }
  const pptType: PptType = body.ppt_type === "academic_discussion" ? "academic_discussion" : "case_showcase"
  if (body.ppt_type && body.ppt_type !== "case_showcase" && body.ppt_type !== "academic_discussion") return errorResponse("PPT 类型无效")
  try {
    const supabase = createServerSupabaseClient(), caseId = body.case_id || id, requestedTimepoints = requestTimepoints(body)
    const { data: caseData, error: caseError } = await supabase.from("cases").select("id,case_code,case_type").eq("id", caseId).single()
    if (caseError || !caseData) return errorResponse("病例不存在", 404)
    const isAnteriorComparison = caseData.case_type === "anterior_aesthetics" && pptType === "case_showcase" && requestedTimepoints.length === 2 && requestedTimepoints.every((timepoint) => timepoint.selected_image_ids.length === 1)
    const matched = await Promise.all(requestedTimepoints.map(async (requestTimepoint) => {
      const { data: timepoint, error: timepointError } = await supabase.from("case_timepoints").select("id,captured_on,sequence_order,completed_at").eq("case_id", caseId).eq("id", requestTimepoint.timepoint_id).not("completed_at", "is", null).maybeSingle()
      if (timepointError) throw timepointError
      if (!timepoint) throw new RequestValidationError("所选时间点不存在或尚未完成")
      const { data: images, error: imageError } = await supabase.from("case_images").select("id,image_path,timepoint_id").eq("case_id", caseId).eq("timepoint_id", timepoint.id).in("id", requestTimepoint.selected_image_ids)
      if (imageError) throw imageError
      if ((images ?? []).length !== requestTimepoint.selected_image_ids.length) throw new RequestValidationError(`${timepointTitle(timepoint)} 所选照片不属于当前已完成时间点`)
      const { data: reviews, error: reviewError } = await supabase.from("image_reviews").select("image_id,view_label").in("image_id", requestTimepoint.selected_image_ids)
      if (reviewError) throw reviewError
      const reviewById = new Map((reviews ?? []).map((review) => [review.image_id, review.view_label]))
      const labels = requestTimepoint.selected_image_ids.map((imageId) => reviewById.get(imageId) ?? null)
      const matches = (order: string[]) => requestTimepoint.selected_image_ids.length === order.length && order.every((view) => labels.includes(view))
      const layoutType: LayoutType | null = isAnteriorComparison && labels[0] === FRONTAL ? "anterior_aesthetics_comparison" : matches(STANDARD_5_ORDER) ? "intraoral_standard_5" : matches(STANDARD_3_ORDER) ? "intraoral_standard_3" : null
      if (!layoutType) throw new RequestValidationError(isAnteriorComparison ? `${timepointTitle(timepoint)} 需选择 1 张正面咬合像。` : `${timepointTitle(timepoint)} 当前选择暂不支持生成 PPT。请选择标准口内三图，或完整标准口内五图。`)
      const order = layoutType === "anterior_aesthetics_comparison" ? [FRONTAL] : layoutType === "intraoral_standard_5" ? STANDARD_5_ORDER : STANDARD_3_ORDER
      const orderedImages = order.map((view) => {
        const imageId = requestTimepoint.selected_image_ids.find((id) => reviewById.get(id) === view)
        return images?.find((image) => image.id === imageId) ?? null
      })
      if (orderedImages.some((image) => !image)) throw new RequestValidationError("照片的 view_label 不匹配标准口内布局")
      return { ...timepoint, layoutType, images: await Promise.all((orderedImages as { id: string; image_path: string; timepoint_id: string }[]).map(async (image) => ({ id: image.id, image_path: image.image_path, view_label: reviewById.get(image.id)!, photo: await fetchPhoto(supabase.storage.from("case-images").getPublicUrl(image.image_path).data.publicUrl) }))) } satisfies MatchedTimepoint
    }))
    matched.sort((a, b) => a.sequence_order - b.sequence_order)
    const totalSelectedImages = matched.reduce((sum, timepoint) => sum + timepoint.images.length, 0)
    const isFivePlusThree = matched.length === 2 && totalSelectedImages === 8 && matched.some((timepoint) => timepoint.layoutType === "intraoral_standard_5") && matched.some((timepoint) => timepoint.layoutType === "intraoral_standard_3")
    const imageSize: IntraoralImageSize = isFivePlusThree ? { w: INTRAORAL_IMAGE_W_DENSE_8, h: INTRAORAL_IMAGE_H_DENSE_8 } : { w: INTRAORAL_IMAGE_W, h: INTRAORAL_IMAGE_H }
    const { data: savedSummary, error: summaryError } = await supabase.from("case_summaries").select("summary_json").eq("case_id", caseId).maybeSingle()
    if (summaryError) throw summaryError
    const summary = savedSummary?.summary_json && typeof savedSummary.summary_json === "object" ? savedSummary.summary_json as Summary : null
    const treatmentProgress = selectedFacts(body.selected_summary?.treatment_progress, facts(summary, ["treatment_actions", "completion_summary"]))
    const currentStatus = pptType === "academic_discussion" ? selectedFacts(body.selected_summary?.current_status, facts(summary, ["current_status", "completion_summary", "initial_status", "final_outcome"])) : []
    const finalStatus = pptType === "case_showcase" ? selectedFacts(body.selected_summary?.final_status, facts(summary, ["final_outcome"])) : []
    const keyChanges = isAnteriorComparison ? facts(summary, ["key_changes"]) : []
    if (treatmentProgress.length + (pptType === "academic_discussion" ? currentStatus.length : finalStatus.length) > 6) return errorResponse("病例总结最多选择 6 条")
    const discussionQuestion = pptType === "academic_discussion" ? (typeof body.discussion_question === "string" ? body.discussion_question.trim() : "") : ""
    if (discussionQuestion.length > 300) return errorResponse("当前问题最多 300 个字符")
    const pptx = new PptxGenJS()
    const pptLabel = pptType === "academic_discussion" ? "学术交流" : "病例展示"
    pptx.layout = "LAYOUT_WIDE"; pptx.author = "DentCase"; pptx.company = "DentCase"; pptx.subject = pptLabel; pptx.title = `DentCase ${caseData.case_code} ${pptLabel}`; pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" }
    const slide = pptx.addSlide(); slide.background = { color: "FFFFFF" }
    slide.addText("病例讨论", { x: VISUAL.marginX, y: VISUAL.headerY, w: 3.2, h: 0.42, fontFace: "Microsoft YaHei", fontSize: 24, bold: true, color: VISUAL.text, margin: 0 })
    slide.addShape("line", { x: VISUAL.marginX, y: 0.92, w: 12.28, h: 0, line: { color: VISUAL.divider, width: 0.55 } })
    const leftX = VISUAL.marginX, topY = VISUAL.contentY, imageW = VISUAL.imageW, imageH = VISUAL.contentH, rightX = leftX + imageW + VISUAL.columnGap, rightW = 13.33 - rightX - VISUAL.marginX
    if (isAnteriorComparison) addAnteriorComparison(slide, matched, leftX, topY, imageW, imageH)
    else if (matched.length === 1) {
      const imageByView = new Map(matched[0].images.map((image) => [image.view_label, image]))
      if (matched[0].layoutType === "intraoral_standard_5") {
        addIntraoralFive(slide, imageByView, leftX, topY, imageW, imageH, imageSize)
      } else addIntraoralThree(slide, imageByView, leftX, topY, imageW, imageH, imageSize)
    } else addMultiTimepointPhotos(slide, matched, leftX, topY, imageW, imageH, imageSize)
    if (pptType === "academic_discussion") {
      addInfoColumn(slide, [
        { title: "当前病例状态", values: currentStatus },
        { title: "已完成治疗阶段 / 处理", values: treatmentProgress },
        { title: "当前问题", values: discussionQuestion ? [discussionQuestion] : [] },
      ], rightX, topY + 0.05, rightW)
    } else {
      addInfoColumn(slide, [
        { title: "当前状态", values: [matched.length === 1 ? `已选择时间点：${matched[0].captured_on?.slice(0, 10) || "日期未填写"}` : `已选择 ${matched.length} 个时间点`] },
        { title: "治疗过程", values: treatmentProgress },
        { title: "关键变化", values: keyChanges },
        { title: "最终情况", values: finalStatus },
      ], rightX, topY + 0.05, rightW)
    }
    const output = await pptx.write({ outputType: "nodebuffer" }) as Buffer, safeCode = String(caseData.case_code).replace(/[^a-zA-Z0-9_-]/g, "_"), filename = `DentCase_${safeCode}_${pptLabel}.pptx`, asciiFilename = `DentCase_${safeCode}_${pptType}.pptx`
    const summaryFields = pptType === "academic_discussion" ? [currentStatus.length ? "current_status" : "none", treatmentProgress.length ? "treatment_actions_or_completion_summary" : "none"] : [treatmentProgress.length ? "treatment_actions_or_completion_summary" : "none", finalStatus.length ? "final_outcome" : "none"]
    return new Response(new Uint8Array(output), { status: 200, headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`, "Content-Length": String(output.length), "X-DentCase-Ppt-Type": pptType, "X-DentCase-Timepoint-Ids": matched.map((timepoint) => timepoint.id).join(","), "X-DentCase-Image-Ids": matched.flatMap((timepoint) => timepoint.images.map((image) => image.id)).join(","), "X-DentCase-Layout-Types": matched.map((timepoint) => timepoint.layoutType).join(","), "X-DentCase-Summary-Fields": summaryFields.join(",") } })
  } catch (error) {
    if (error instanceof RequestValidationError) return errorResponse(error.message)
    return errorResponse(error instanceof Error ? error.message : "PPT 生成失败", 500)
  }
}
