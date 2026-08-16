"use client"

import { useState } from "react"

type Fact = { content: string }
type Timeline = Fact & { timepoint_id: string; captured_on: string; stage: string }
type Summary = { case_overview: Fact; treatment_timeline: Timeline[]; [key: string]: unknown }
const sectionKeys = { initial: ["initial_status", "treatment_actions", "follow_up_focus"], ongoing: ["initial_status", "treatment_actions", "key_changes", "current_status", "follow_up_focus"], completed: ["initial_status", "treatment_actions", "key_changes", "final_outcome", "completion_summary", "post_treatment_follow_up"] }
const sectionLabels: Record<string, string> = { initial_status: "初诊情况", treatment_actions: "治疗处理", key_changes: "关键变化", current_status: "当前情况", follow_up_focus: "后续关注", final_outcome: "最终情况", completion_summary: "治疗总结", post_treatment_follow_up: "治疗后随访" }
const modeLabels: Record<string, string> = { initial: "初始记录", ongoing: "治疗进行中", completed: "治疗已完成" }
function formatTimelineDate(value: string) { return value.slice(0, 10) }

function isSummary(value: unknown, mode: string): value is Summary {
  if (!value || typeof value !== "object") return false
  const summary = value as Record<string, unknown>
  return Boolean(summary.case_overview && typeof summary.case_overview === "object" && typeof (summary.case_overview as Fact).content === "string" && Array.isArray(summary.treatment_timeline) && sectionKeys[mode as keyof typeof sectionKeys]?.every((key) => Array.isArray(summary[key])))
}

export default function CaseSummaryPanel({ caseId, initialSummary = null, initialMode = null }: { caseId: string; initialSummary?: Summary | null; initialMode?: string | null }) {
  const [summary, setSummary] = useState<Summary | null>(initialSummary), [mode, setMode] = useState<string | null>(initialMode), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  async function generate() { setLoading(true); setError(null); try { const response = await fetch(`/api/cases/${caseId}/summary`, { method: "POST" }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "病例总结生成失败"); if (!isSummary(body.summary, body.summary_mode)) throw new Error("病例总结返回格式异常，请重新生成。"); setSummary(body.summary); setMode(body.summary_mode) } catch (reason) { setError(reason instanceof Error ? reason.message : "病例总结生成失败") } finally { setLoading(false) } }
  const configuredSections = mode ? sectionKeys[mode as keyof typeof sectionKeys] : undefined
  const sections = Array.isArray(configuredSections) ? configuredSections : []
  return <section className="mt-8 rounded-xl border bg-white p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">病例总结</h2><button type="button" onClick={() => void generate()} disabled={loading} className="rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">{summary ? "重新生成病例总结" : "生成病例总结"}</button></div>{loading && <p className="mt-4 text-gray-600">正在生成病例总结，通常需要约 1 分钟，请稍候。</p>}{error && <div className="mt-4"><p className="text-red-600">{error}</p>{!loading && <button type="button" onClick={() => void generate()} className="mt-2 rounded border px-3 py-1 text-sm">重新生成</button>}</div>}{summary && mode && !loading && <div className="mt-5 space-y-5"><p className="text-sm text-gray-500">总结模式：{modeLabels[mode] ?? mode}</p><article><h3 className="font-medium">病例概述</h3><p className="mt-2 leading-7">{summary.case_overview.content}</p></article><article><h3 className="font-medium">治疗时间线</h3><div className="mt-2 space-y-3">{(Array.isArray(summary.treatment_timeline) ? summary.treatment_timeline : []).map((item, index) => <div key={item.timepoint_id ?? index}><p className="text-sm text-gray-500">{formatTimelineDate(item.captured_on)}</p><p className="leading-7">{item.content}</p></div>)}</div></article>{sections.map((key) => { const items = Array.isArray(summary[key]) ? summary[key] as Fact[] : []; return <article key={key}><h3 className="font-medium">{sectionLabels[key] ?? key}</h3>{items.length ? <ul className="mt-2 list-disc space-y-1 pl-5">{items.map((item, index) => <li key={`${key}-${index}`} className="leading-7">{item.content}</li>)}</ul> : <p className="mt-2 text-sm text-gray-500">暂无记录</p>}</article>})}</div>}</section>
}
