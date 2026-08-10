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
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-black"
          >
            ← 返回总病历库
          </Link>

          <h1 className="mt-6 text-3xl font-bold">
            缺少病例类型
          </h1>

          <p className="mt-2 text-gray-500">
            请先从总病历库选择病例类型。
          </p>
        </div>
      </main>
    )
  }

  const validCaseType = caseType as CaseType

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/cases?case_type=${validCaseType}`}
          className="text-sm text-gray-500 hover:text-black"
        >
          ← 返回{caseTypeLabels[validCaseType]}病例库
        </Link>

        <h1 className="mt-6 text-3xl font-bold">
          新建{caseTypeLabels[validCaseType]}病例
        </h1>

        <p className="mt-2 text-gray-500">
          创建病例后，可以在病例详情页上传图片。
        </p>

        <div className="mt-8 rounded-xl border bg-white p-6">
          <NewCaseForm caseType={validCaseType} />
        </div>
      </div>
    </main>
  )
}
