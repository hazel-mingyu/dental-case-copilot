import Link from "next/link"
import { caseTypeLabels } from "../lib/caseType"

const CASE_TYPES = Object.entries(caseTypeLabels)

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">
          总病历库
        </h1>

        <p className="mt-3 text-gray-500">
          请选择要查看的治疗类型。
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {CASE_TYPES.map(([value, label]) => (
            <Link
              key={value}
              href={`/cases?case_type=${value}`}
              className="rounded-xl border bg-white p-8 text-center text-lg font-semibold transition hover:shadow-md"
            >
              {label}病例
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
