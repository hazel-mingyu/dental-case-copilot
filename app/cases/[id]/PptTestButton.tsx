"use client"
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react"
import { getPhotoViewLabel, PHOTO_VIEW_GROUPS } from "../../../lib/photoViewTaxonomy"

type Fact = { content?: unknown }
type Summary = Record<string, unknown>
type Photo = { id: string; url: string; view_label: string | null }
type Timepoint = { id: string; captured_on: string | null; sequence_order: number; images: Photo[] }
type ImageSelections = Record<string, string[]>
type PptType = "case_showcase" | "academic_discussion"

const STANDARD_3 = ["intraoral_right_buccal", "intraoral_frontal", "intraoral_left_buccal"]
const STANDARD_5 = ["intraoral_maxillary_occlusal", "intraoral_right_buccal", "intraoral_frontal", "intraoral_left_buccal", "intraoral_mandibular_occlusal"]
const MAX_TIMEPOINTS = 3
const MAX_IMAGES_PER_TIMEPOINT = 6
const MAX_IMAGES_TOTAL = 10
const INTRAORAL_GROUP = PHOTO_VIEW_GROUPS.find((group) => group.label === "口内")

function summaryFacts(summary: Summary | null, keys: string[]) {
  if (!summary) return []
  for (const key of keys) {
    const value = summary[key]
    if (!Array.isArray(value)) continue
    const items = value
      .map((item: Fact) => typeof item?.content === "string" ? item.content.trim() : "")
      .filter(Boolean)
    if (items.length) return [...new Set(items)]
  }
  return []
}

function formatDate(value: string | null) { return value?.slice(0, 10) ?? "未填写日期" }

function layoutFor(photos: Photo[], selectedIds: string[]) {
  const labels = photos.filter((photo) => selectedIds.includes(photo.id)).map((photo) => photo.view_label)
  const matches = (views: string[]) => selectedIds.length === views.length && views.every((view) => labels.includes(view))
  return matches(STANDARD_5) ? "intraoral_standard_5" : matches(STANDARD_3) ? "intraoral_standard_3" : null
}

export default function PptTestButton({ caseId, summary, timepoints, defaultPptType, caseType }: { caseId: string; summary: Summary | null; timepoints: Timepoint[]; defaultPptType: PptType; caseType: string | null }) {
  const treatmentOptions = useMemo(() => summaryFacts(summary, ["treatment_actions", "completion_summary"]), [summary])
  const finalOptions = useMemo(() => summaryFacts(summary, ["final_outcome"]), [summary])
  const currentStatusOptions = useMemo(() => summaryFacts(summary, ["current_status", "completion_summary", "initial_status", "final_outcome"]), [summary])
  const [pptType, setPptType] = useState<PptType>(defaultPptType)
  const [selectedTimepointIds, setSelectedTimepointIds] = useState<string[]>([])
  const [imagesByTimepoint, setImagesByTimepoint] = useState<ImageSelections>({})
  const [treatmentProgress, setTreatmentProgress] = useState<string[]>([])
  const [finalStatus, setFinalStatus] = useState<string[]>([])
  const [currentStatus, setCurrentStatus] = useState<string[]>([])
  const [academicTreatmentProgress, setAcademicTreatmentProgress] = useState<string[]>([])
  const [discussionQuestion, setDiscussionQuestion] = useState("")
  const [state, setState] = useState<"idle" | "generating" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const totalImages = Object.values(imagesByTimepoint).reduce((sum, ids) => sum + ids.length, 0)
  const selectedTimepoints = timepoints.filter((timepoint) => selectedTimepointIds.includes(timepoint.id))
  const layouts = new Map(selectedTimepoints.map((timepoint) => [timepoint.id, layoutFor(timepoint.images, imagesByTimepoint[timepoint.id] ?? [])]))
  const isAnteriorComparison = caseType === "anterior_aesthetics" && pptType === "case_showcase" && selectedTimepoints.length === 2 && totalImages === 2 && selectedTimepoints.every((timepoint) => { const selectedIds = imagesByTimepoint[timepoint.id] ?? []; return selectedIds.length === 1 && timepoint.images.some((photo) => photo.id === selectedIds[0] && photo.view_label === "intraoral_frontal") })
  const canGenerate = isAnteriorComparison || selectedTimepoints.length > 0 && totalImages <= MAX_IMAGES_TOTAL && selectedTimepoints.every((timepoint) => Boolean(layouts.get(timepoint.id)))
  const selectedSummaryCount = pptType === "academic_discussion" ? currentStatus.length + academicTreatmentProgress.length : treatmentProgress.length + finalStatus.length
  const timepointSelectionText = `已选择 ${selectedTimepointIds.length} / ${MAX_TIMEPOINTS} 个时间点 · ${totalImages} / ${MAX_IMAGES_TOTAL} 张照片`
  const summarySelectionText = `已选择 ${selectedSummaryCount} 条总结 · ${totalImages} / ${MAX_IMAGES_TOTAL} 张照片`

  function toggleSummary(value: string, current: string[], setCurrent: (next: string[]) => void, totalSelected: number) {
    if (current.includes(value)) return setCurrent(current.filter((item) => item !== value))
    if (current.length >= 3 || totalSelected >= 6) return
    setCurrent([...current, value])
  }

  function selectTimepoint(timepointId: string) {
    setSelectedTimepointIds((current) => {
      if (current.includes(timepointId) || current.length >= MAX_TIMEPOINTS) return current
      return [...current, timepointId]
    })
    setImagesByTimepoint((current) => current[timepointId] ? current : { ...current, [timepointId]: [] })
    setError(null)
  }

  function removeTimepoint(timepointId: string) {
    setSelectedTimepointIds((current) => current.filter((id) => id !== timepointId))
    setImagesByTimepoint((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== timepointId)))
    setError(null)
  }

  function togglePhoto(timepointId: string, imageId: string) {
    setImagesByTimepoint((current) => {
      const selected = current[timepointId] ?? []
      if (selected.includes(imageId)) {
        const nextSelected = selected.filter((id) => id !== imageId)
        if (!nextSelected.length) {
          setSelectedTimepointIds((timepoints) => timepoints.filter((id) => id !== timepointId))
          return Object.fromEntries(Object.entries(current).filter(([id]) => id !== timepointId))
        }
        return { ...current, [timepointId]: nextSelected }
      }
      const currentTotal = Object.values(current).reduce((sum, ids) => sum + ids.length, 0)
      if (selected.length >= MAX_IMAGES_PER_TIMEPOINT || currentTotal >= MAX_IMAGES_TOTAL) return current
      return { ...current, [timepointId]: [...selected, imageId] }
    })
  }

  async function generate() {
    if (!canGenerate) return
    setState("generating")
    setError(null)
    try {
      const response = await fetch(`/api/cases/${caseId}/ppt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseId,
          ppt_type: pptType,
          selected_timepoints: selectedTimepoints.map((timepoint) => ({ timepoint_id: timepoint.id, selected_image_ids: imagesByTimepoint[timepoint.id] ?? [] })),
          selected_summary: pptType === "academic_discussion" ? { current_status: currentStatus, treatment_progress: academicTreatmentProgress } : { treatment_progress: treatmentProgress, final_status: finalStatus },
          discussion_question: pptType === "academic_discussion" ? discussionQuestion : undefined,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || "PPT 生成失败")
      }
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `DentCase_${pptType === "academic_discussion" ? "学术交流" : "病例展示"}.pptx`
      anchor.click()
      URL.revokeObjectURL(url)
      setState("idle")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PPT 生成失败")
      setState("error")
    }
  }

  return <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
    <div><p className="text-sm text-gray-500">内容选择</p><h2 className="mt-1 text-xl font-semibold text-gray-900">生成病例 PPT</h2></div>
    <PptTypeSelector pptType={pptType} onChange={setPptType} />
    <p className="mt-2 text-sm text-gray-500">{caseType === "anterior_aesthetics" && pptType === "case_showcase" ? "病例展示可选择 2 个时间点、每点 1 张正面咬合像作治疗前后对比；其他选择继续支持标准口内三图或五图。" : "最多选择 3 个已完成时间点，仅支持标准口内三图或五图。"}</p>
    <div className="mt-6 space-y-7 border-t border-gray-100 pt-5">
      {pptType === "academic_discussion" ? <AcademicSummarySelection currentStatusOptions={currentStatusOptions} currentStatus={currentStatus} treatmentOptions={treatmentOptions} treatmentProgress={academicTreatmentProgress} discussionQuestion={discussionQuestion} onToggleCurrent={(value) => toggleSummary(value, currentStatus, setCurrentStatus, currentStatus.length + academicTreatmentProgress.length)} onToggleTreatment={(value) => toggleSummary(value, academicTreatmentProgress, setAcademicTreatmentProgress, currentStatus.length + academicTreatmentProgress.length)} onQuestionChange={setDiscussionQuestion} /> : <ShowcaseSummarySelection treatmentOptions={treatmentOptions} treatmentProgress={treatmentProgress} finalOptions={finalOptions} finalStatus={finalStatus} onToggleTreatment={(value) => toggleSummary(value, treatmentProgress, setTreatmentProgress, treatmentProgress.length + finalStatus.length)} onToggleFinal={(value) => toggleSummary(value, finalStatus, setFinalStatus, treatmentProgress.length + finalStatus.length)} />}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium text-gray-900">选择病例照片</h3>
          <p className="text-sm text-gray-500">{timepointSelectionText}</p>
        </div>
        {selectedTimepointIds.length >= MAX_TIMEPOINTS && <p className="mt-2 text-sm text-amber-700">已达到最多 3 个时间点的上限。取消已选时间点后可重新选择。</p>}
        {totalImages >= MAX_IMAGES_TOTAL && <p className="mt-2 text-sm text-amber-700">已达到最多 10 张照片的上限。</p>}
        <div className="mt-4 space-y-4">
          {timepoints.map((timepoint) => <TimepointSelector key={timepoint.id} timepoint={timepoint} selected={selectedTimepointIds.includes(timepoint.id)} selectedIds={imagesByTimepoint[timepoint.id] ?? []} totalImages={totalImages} timepointLimitReached={selectedTimepointIds.length >= MAX_TIMEPOINTS} onSelect={() => selectTimepoint(timepoint.id)} onRemove={() => removeTimepoint(timepoint.id)} onTogglePhoto={(imageId) => togglePhoto(timepoint.id, imageId)} layoutType={layouts.get(timepoint.id) ?? null} />)}
        </div>
        {!timepoints.length && <p className="mt-3 text-sm text-gray-500">暂无已完成时间点。</p>}
      </section>
    </div>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
      <p className="text-sm text-gray-600">{summarySelectionText}</p>
      <button type="button" onClick={() => void generate()} disabled={!canGenerate || state === "generating"} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300">{state === "generating" ? "正在生成病例 PPT" : "生成病例 PPT"}</button>
    </div>
    {!canGenerate && caseType === "anterior_aesthetics" && pptType === "case_showcase" && selectedTimepoints.length > 0 && <p className="mt-3 text-sm text-amber-700">治疗前后对比需恰好选择 2 个时间点，且每个时间点各选择 1 张正面咬合像。</p>}
    {!isAnteriorComparison && selectedTimepoints.some((timepoint) => !layouts.get(timepoint.id)) && <p className="mt-3 text-sm text-amber-700">每个已选时间点均需单独选择标准口内三图，或完整标准口内五图。</p>}
    {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
  </section>
}

function PptTypeSelector({ pptType, onChange }: { pptType: PptType; onChange: (value: PptType) => void }) {
  return <div className="mt-5">
    <p className="text-sm font-medium text-gray-900">PPT 类型</p>
    <div className="mt-2 flex flex-wrap gap-3">
      <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${pptType === "academic_discussion" ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"}`}><input type="radio" name="ppt-type" checked={pptType === "academic_discussion"} onChange={() => onChange("academic_discussion")} />学术交流</label>
      <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${pptType === "case_showcase" ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"}`}><input type="radio" name="ppt-type" checked={pptType === "case_showcase"} onChange={() => onChange("case_showcase")} />病例展示</label>
    </div>
  </div>
}

function AcademicSummarySelection({ currentStatusOptions, currentStatus, treatmentOptions, treatmentProgress, discussionQuestion, onToggleCurrent, onToggleTreatment, onQuestionChange }: { currentStatusOptions: string[]; currentStatus: string[]; treatmentOptions: string[]; treatmentProgress: string[]; discussionQuestion: string; onToggleCurrent: (value: string) => void; onToggleTreatment: (value: string) => void; onQuestionChange: (value: string) => void }) {
  return <section>
    <h3 className="font-medium text-gray-900">病例总结</h3>
    <SummaryChoices title="当前病例状态" values={currentStatusOptions} selected={currentStatus} onToggle={onToggleCurrent} />
    <SummaryChoices title="已完成治疗阶段 / 处理" values={treatmentOptions} selected={treatmentProgress} onToggle={onToggleTreatment} />
    <div className="mt-4">
      <label htmlFor="discussion-question" className="text-sm text-gray-700">当前问题（可选）</label>
      <textarea id="discussion-question" value={discussionQuestion} onChange={(event) => onQuestionChange(event.target.value)} maxLength={300} rows={4} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="请输入本次学术交流希望讨论的问题" />
      <p className="mt-1 text-right text-xs text-gray-500">{discussionQuestion.length} / 300</p>
    </div>
  </section>
}

function ShowcaseSummarySelection({ treatmentOptions, treatmentProgress, finalOptions, finalStatus, onToggleTreatment, onToggleFinal }: { treatmentOptions: string[]; treatmentProgress: string[]; finalOptions: string[]; finalStatus: string[]; onToggleTreatment: (value: string) => void; onToggleFinal: (value: string) => void }) {
  return <section>
    <h3 className="font-medium text-gray-900">病例总结</h3>
    <SummaryChoices title="治疗过程" values={treatmentOptions} selected={treatmentProgress} onToggle={onToggleTreatment} />
    <SummaryChoices title="最终情况" values={finalOptions} selected={finalStatus} onToggle={onToggleFinal} />
  </section>
}

function TimepointSelector({ timepoint, selected, selectedIds, totalImages, timepointLimitReached, onSelect, onRemove, onTogglePhoto, layoutType }: { timepoint: Timepoint; selected: boolean; selectedIds: string[]; totalImages: number; timepointLimitReached: boolean; onSelect: () => void; onRemove: () => void; onTogglePhoto: (imageId: string) => void; layoutType: string | null }) {
  const intraoralPhotos = INTRAORAL_GROUP ? timepoint.images.filter((photo) => INTRAORAL_GROUP.views.includes(photo.view_label as never)) : []
  const selectedPhotoText = `已选择 ${selectedIds.length} / ${MAX_IMAGES_PER_TIMEPOINT} 张照片${layoutType ? ` · ${layoutType === "intraoral_standard_5" ? "标准口内五图" : "标准口内三图"}` : ""}`
  return <article className={`rounded-xl border p-4 transition ${selected ? "border-emerald-300 bg-emerald-50/40" : "border-gray-200 bg-white hover:border-emerald-200"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-medium text-gray-900">时间点 {timepoint.sequence_order} · {formatDate(timepoint.captured_on)}</p>
        {selected && <p className="mt-1 text-sm text-gray-600">{selectedPhotoText}</p>}
      </div>
      <button type="button" onClick={selected ? onRemove : onSelect} disabled={!selected && timepointLimitReached} className={`rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 ${selected ? "border-emerald-700 text-emerald-800 hover:bg-emerald-100" : "border-gray-300 bg-white text-gray-700 hover:border-emerald-600 hover:bg-emerald-50"}`}>{selected ? "取消此时间点" : "选择此时间点"}</button>
    </div>
    {selected && <PhotoGroup categoryCode="intraoral" title="口内" photos={intraoralPhotos} selectedIds={selectedIds} totalImages={totalImages} onToggle={onTogglePhoto} />}
  </article>
}

function PhotoGroup({ categoryCode, title, photos, selectedIds, totalImages, onToggle }: { categoryCode: "intraoral"; title: string; photos: Photo[]; selectedIds: string[]; totalImages: number; onToggle: (imageId: string) => void }) {
  if (!photos.length) return null
  return <section className="mt-4" data-photo-category={categoryCode}>
    <p className="text-sm font-medium text-gray-700">{title}</p>
    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {photos.map((photo) => <PhotoOption key={photo.id} photo={photo} selected={selectedIds.includes(photo.id)} disabled={!selectedIds.includes(photo.id) && (selectedIds.length >= MAX_IMAGES_PER_TIMEPOINT || totalImages >= MAX_IMAGES_TOTAL)} onToggle={onToggle} />)}
    </div>
  </section>
}

function PhotoOption({ photo, selected, disabled, onToggle }: { photo: Photo; selected: boolean; disabled: boolean; onToggle: (imageId: string) => void }) {
  const displayLabel = `${selected ? "已选择 · " : ""}${getPhotoViewLabel(photo.view_label)}`
  return <button type="button" disabled={disabled} onClick={() => onToggle(photo.id)} className={`overflow-hidden rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-2 border-emerald-600 ring-2 ring-emerald-100" : "border-gray-200 hover:border-emerald-300"}`}>
    <img src={photo.url} alt={getPhotoViewLabel(photo.view_label)} className="h-28 w-full object-cover" />
    <span className="block px-2 py-2 text-xs text-gray-700">{displayLabel}</span>
  </button>
}

function SummaryChoices({ title, values, selected, onToggle }: { title: string; values: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return <div className="mt-3">
    <p className="text-sm text-gray-700">{title}</p>
    {values.length ? <div className="mt-2 space-y-2">{values.map((value) => <label key={`${title}:${value}`} className="flex cursor-pointer gap-2 text-sm text-gray-700"><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />{value}</label>)}</div> : <p className="mt-2 text-sm text-gray-500">暂无可选条目。</p>}
  </div>
}
