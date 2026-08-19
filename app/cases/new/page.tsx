import Link from "next/link"
import {
  caseTypeLabels,
  isCaseType,
  type CaseType,
} from "../../../lib/caseType"
import NewCaseForm from "./NewCaseForm"

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{
    case_type?: string
  }>
}) {
  const params = await searchParams
  const caseType = params.case_type

  if (!caseType || !isCaseType(caseType)) {
    return (
      <main className="min-h-screen bg-[#f9faf9] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="text-sm text-[#597369] hover:text-[#0d5940]"
          >
            ← 返回总病历库
          </Link>

          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[#212e29]">
            缺少病例类型
          </h1>

          <p className="mt-2 text-[#597369]">
            请先从总病历库选择病例类型。
          </p>
        </div>
      </main>
    )
  }

  const validCaseType = caseType as CaseType

  return (
    <main className="min-h-screen bg-[#f9faf9] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/cases?case_type=${validCaseType}`}
          className="text-sm text-[#597369] hover:text-[#0d5940]"
        >
          ← 返回{caseTypeLabels[validCaseType]}病例库
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[#212e29]">
          新建{caseTypeLabels[validCaseType]}病例
        </h1>

        <p className="mt-2 text-[#597369]">
          创建病例后，可以在病例详情页上传图片。
        </p>

        <div className="mt-8 rounded-xl border border-[#dbe3de] bg-white p-6 sm:p-7">
          <NewCaseForm caseType={validCaseType} />
        </div>
      </div>
    </main>
  )
}
