import Link from "next/link"
import { caseTypeLabels } from "../lib/caseType"
import { supabase } from "../lib/supabase"

const CASE_TYPES = Object.entries(caseTypeLabels)

type CaseOverviewItem = { id: string; case_type: string | null }
type CaseTimepoint = { case_id: string; captured_on: string | null }

export const dynamic = "force-dynamic"

export default async function Home() {
  const [{ data }, { data: timepointData }] = await Promise.all([
    supabase.from("cases").select("id,case_type"),
    supabase.from("case_timepoints").select("case_id,captured_on").not("captured_on", "is", null),
  ])
  const cases = (data ?? []) as CaseOverviewItem[]
  const firstVisitByCaseId = new Map<string, Date>()
  for (const timepoint of (timepointData ?? []) as CaseTimepoint[]) {
    if (!timepoint.captured_on) continue
    const capturedOn = new Date(timepoint.captured_on)
    if (Number.isNaN(capturedOn.getTime())) continue
    const current = firstVisitByCaseId.get(timepoint.case_id)
    if (!current || capturedOn < current) firstVisitByCaseId.set(timepoint.case_id, capturedOn)
  }
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - 5 + index, 1))
  const monthCounts = months.map((month) => ({
    label: `${month.getMonth() + 1}月`,
    count: [...firstVisitByCaseId.values()].filter((firstVisit) => firstVisit.getFullYear() === month.getFullYear() && firstVisit.getMonth() === month.getMonth()).length,
  }))
  const maxMonthCount = Math.max(1, ...monthCounts.map((item) => item.count))

  return (
    <main className="min-h-screen bg-[#f9faf9] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1120px]">
        <header className="bg-white px-2 py-3">
          <p className="text-sm text-[#597369]">DentCase</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#212e29]">总病历库</h1>
          <p className="mt-2 text-sm text-[#597369]">按治疗类型进入病例库，查看和管理已有病例。</p>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="病例概览">
          <div className="rounded-[10px] border border-[#dbe3de] bg-white px-5 py-4"><p className="text-xs text-[#597369]">总病例数</p><p className="mt-2 text-2xl font-semibold text-[#212e29]">{cases.length}</p></div>
          {CASE_TYPES.map(([value, label]) => <div key={value} className="rounded-[10px] border border-[#dbe3de] bg-white px-5 py-4"><p className="text-xs text-[#597369]">{label}病例</p><p className="mt-2 text-2xl font-semibold text-[#212e29]">{cases.filter((item) => item.case_type === value).length}</p></div>)}
        </section>

        <section className="mt-6 rounded-[10px] border border-[#dbe3de] bg-white p-5">
          <div className="flex items-baseline justify-between gap-3"><h2 className="text-lg font-semibold text-[#303b36]">近 6 个月初诊病例</h2><p className="text-xs text-[#597369]">按最早临床时间点统计</p></div>
          <div className="mt-5 flex h-28 items-end gap-3 sm:gap-5">{monthCounts.map((item) => <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2"><span className="text-xs text-[#597369]">{item.count}</span><div className="flex h-16 w-full items-end rounded-sm bg-[#f1f5f2]"><div className="w-full rounded-sm bg-[#126e47]" style={{ height: `${Math.max(item.count ? 12 : 0, item.count / maxMonthCount * 100)}%` }} /></div><span className="text-xs text-[#667570]">{item.label}</span></div>)}</div>
        </section>

        <section className="mt-6"><div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold text-[#303b36]">治疗类型</h2><p className="text-sm text-[#597369]">选择后进入病例库</p></div><div className="mt-4 grid gap-4 sm:grid-cols-2">
          {CASE_TYPES.map(([value, label]) => (
            <Link
              key={value}
              href={`/cases?case_type=${value}`}
              className="group rounded-xl border border-[#dbe3de] bg-white p-5 transition hover:border-[#9ebcad]"
            >
              <div className="flex items-center justify-between gap-4"><div className="text-left"><p className="text-lg font-semibold text-[#212e29]">{label}病例</p><p className="mt-2 text-sm text-[#597369]">{cases.filter((item) => item.case_type === value).length} 个病例</p></div><span className="text-xl text-[#0f6b45] transition group-hover:translate-x-0.5">→</span></div>
            </Link>
          ))}
        </div></section>
      </div>
    </main>
  )
}
