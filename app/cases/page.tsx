import Link from "next/link"
import { supabase } from "../../lib/supabase"
import {
  caseTypeLabels,
  isCaseType,
  type CaseType,
} from "../../lib/caseType"
import DeleteCaseButton from "../DeleteCaseButton"

export const dynamic = "force-dynamic"

type CaseItem = {
  id: string
  case_code: string
  patient_name: string | null
  patient_phone: string | null
  title: string | null
  created_at: string
}

type Timepoint = {
  case_id: string
  captured_on: string | null
  created_at: string
}

function getLatestVisit(
  caseItem: CaseItem,
  timepoints: Timepoint[]
) {
  const dates = timepoints
    .map((timepoint) =>
      timepoint.captured_on || timepoint.created_at
    )
    .filter(Boolean)
    .map((date) => new Date(date).getTime())

  if (dates.length === 0) {
    return caseItem.created_at
  }

  return new Date(Math.max(...dates)).toISOString()
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    case_type?: string
    q?: string
  }>
}) {
  const params = await searchParams
  const requestedCaseType = params.case_type
  const searchQuery = params.q?.trim() ?? ""

  if (
    !requestedCaseType
    || !isCaseType(requestedCaseType)
  ) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-black"
          >
            ← 返回总病历库
          </Link>

          <h1 className="mt-6 text-3xl font-bold">
            请选择病例类型
          </h1>

          <p className="mt-3 text-gray-500">
            请通过总病历库选择一个治疗类型。
          </p>
        </div>
      </main>
    )
  }

  const caseType = requestedCaseType as CaseType

  let query = supabase
    .from("cases")
    .select(
      "id,case_code,patient_name,patient_phone,title,created_at"
    )
    .eq("case_type", caseType)
    .order("created_at", {
      ascending: false,
    })

  if (searchQuery) {
    const safeSearchQuery = searchQuery.replace(/[%,()]/g, "")

    if (safeSearchQuery) {
      query = query.or(
        `patient_name.ilike.%${safeSearchQuery}%,patient_phone.like.%${safeSearchQuery}%`
      )
    }
  }

  const {
    data,
    error,
  } = await query

  if (error) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">
          病例加载失败
        </h1>

        <p className="mt-3 text-gray-500">
          {error.message}
        </p>
      </main>
    )
  }

  const cases = (data ?? []) as CaseItem[]
  const caseIds = cases.map((caseItem) => caseItem.id)
  let timepoints: Timepoint[] = []

  if (caseIds.length > 0) {
    const {
      data: timepointData,
      error: timepointError,
    } = await supabase
      .from("case_timepoints")
      .select("case_id,captured_on,created_at")
      .in("case_id", caseIds)

    if (!timepointError) {
      timepoints = (timepointData ?? []) as Timepoint[]
    }
  }

  const timepointsByCaseId = new Map<string, Timepoint[]>()

  for (const timepoint of timepoints) {
    const current = timepointsByCaseId.get(timepoint.case_id) ?? []
    current.push(timepoint)
    timepointsByCaseId.set(timepoint.case_id, current)
  }

  const caseTypeLabel = caseTypeLabels[caseType]

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-black"
            >
              ← 返回总病历库
            </Link>

            <h1 className="mt-4 text-3xl font-bold">
              {caseTypeLabel}
            </h1>
          </div>

          <Link
            href={`/cases/new?case_type=${caseType}`}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            + 新建病例
          </Link>
        </div>

        <form
          method="get"
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="hidden"
            name="case_type"
            value={caseType}
          />

          <input
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="搜索患者姓名或电话"
            className="w-full rounded-lg border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black"
          />

          <button
            type="submit"
            className="rounded-lg border bg-white px-5 py-2 text-sm font-medium hover:bg-gray-50"
          >
            搜索
          </button>
        </form>

        {cases.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed bg-gray-50 px-6 py-12 text-center">
            <p className="font-medium text-gray-700">
              暂无患者病例
            </p>

            <p className="mt-2 text-sm text-gray-500">
              可以创建该治疗类型的第一个病例。
            </p>

            <Link
              href={`/cases/new?case_type=${caseType}`}
              className="mt-5 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              新建病例
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {cases.map((caseItem) => {
              const latestVisit = getLatestVisit(
                caseItem,
                timepointsByCaseId.get(caseItem.id) ?? []
              )

              return (
                <div
                  key={caseItem.id}
                  className="flex items-center justify-between gap-4 rounded-xl border bg-white p-5 transition hover:shadow-md"
                >
                  <Link
                    href={`/cases/${caseItem.id}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-lg font-semibold">
                      {caseItem.patient_name || "未填写患者姓名"}
                    </p>

                    <p className="mt-2 text-sm text-gray-500">
                      最近就诊：
                      {new Date(latestVisit).toLocaleString("zh-CN")}
                    </p>
                  </Link>

                  <DeleteCaseButton
                    caseId={caseItem.id}
                    caseCode={caseItem.case_code}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
