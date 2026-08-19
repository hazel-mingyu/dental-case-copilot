"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import type { CaseType } from "../../../lib/caseType"

type Props = {
  caseType: CaseType
}

export default function NewCaseForm({ caseType }: Props) {
  const router = useRouter()

  const [patientName, setPatientName] = useState("")
  const [patientPhone, setPatientPhone] = useState("")
  const [birthYear, setBirthYear] = useState("")
  const [loading, setLoading] = useState(false)

  async function createCase() {
    if (loading) {
      return
    }

    const normalizedPatientName = patientName.trim()
    const normalizedPatientPhone = patientPhone.trim()
    const normalizedBirthYear = birthYear.trim()
    const currentYear = new Date().getFullYear()

    if (!normalizedPatientName) {
      alert("请输入患者姓名")
      return
    }

    if (
      normalizedBirthYear
      && (!/^\d{4}$/.test(normalizedBirthYear)
        || Number(normalizedBirthYear) < 1900
        || Number(normalizedBirthYear) > currentYear)
    ) {
      alert(`请输入 1900-${currentYear} 之间的四位出生年份`)
      return
    }

    setLoading(true)
    const perfStartedAt = performance.now()
    console.info("[perf:create-case] create click start")

    try {
      const duplicateStartedAt = performance.now()
      const { data: existingCases, error: duplicateError } = normalizedPatientPhone
        ? await supabase.from("cases").select("id,case_code,patient_name,patient_phone,case_type").eq("patient_name", normalizedPatientName).eq("patient_phone", normalizedPatientPhone).limit(1)
        : { data: [], error: null }

      if (duplicateError) throw duplicateError
      console.info(`[perf:create-case] duplicate lookup end elapsed_ms=${Math.round(performance.now() - duplicateStartedAt)}`)

      const existingCase = existingCases?.[0]

      if (existingCase) {
        const phoneSuffix = existingCase.patient_phone
          ? existingCase.patient_phone.slice(-4)
          : "未填写"

        const shouldOpen = window.confirm(
          `已有该患者病例：\n\n患者：${existingCase.patient_name}\n电话后四位：${phoneSuffix}\n病例编号：${existingCase.case_code}\n\n点击“确定”打开已有病例，点击“取消”返回。`
        )

        if (shouldOpen) {
          router.push(`/cases/${existingCase.id}`)
        }

        return
      }

      const insertStartedAt = performance.now()
      const {
        data,
        error,
      } = await supabase.rpc(
        "create_case",
        {
          p_title: normalizedPatientName,
        }
      )

      if (error) {
        throw error
      }
      console.info(`[perf:create-case] Supabase insert end elapsed_ms=${Math.round(performance.now() - insertStartedAt)}`)

      const newCase = data?.[0]

      if (!newCase) {
        throw new Error("病例创建失败：未返回病例数据")
      }

      const updateStartedAt = performance.now()
      const { error: updateError } = await supabase
        .from("cases")
        .update({
          case_type: caseType,
          patient_name: normalizedPatientName,
          patient_phone: normalizedPatientPhone || null,
          birth_year: normalizedBirthYear
            ? Number(normalizedBirthYear)
            : null,
        })
        .eq("id", newCase.id)

      if (updateError) {
        await supabase
          .from("cases")
          .delete()
          .eq("id", newCase.id)

        throw updateError
      }
      console.info(`[perf:create-case] case update end elapsed_ms=${Math.round(performance.now() - updateStartedAt)}`)

      console.info(`[perf:create-case] router navigation start elapsed_ms=${Math.round(performance.now() - perfStartedAt)}`)
      router.push(`/cases/${newCase.id}`)
    } catch (error) {
      console.error("创建病例失败", error)

      if (error instanceof Error) {
        alert(error.message)
      } else {
        alert("创建病例失败")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-[#303b36]">
          患者姓名（必填）
        </label>

        <input
          type="text"
          value={patientName}
          onChange={(event) => setPatientName(event.target.value)}
          placeholder="请输入患者姓名"
          className="mt-2 w-full rounded-lg border border-[#c2d6cc] bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#0f6b45] focus:ring-2 focus:ring-[#dcefe4]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[#303b36]">
          患者电话（可选）
        </label>

        <input
          type="tel"
          value={patientPhone}
          onChange={(event) => setPatientPhone(event.target.value)}
          placeholder="请输入患者电话"
          className="mt-2 w-full rounded-lg border border-[#c2d6cc] bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#0f6b45] focus:ring-2 focus:ring-[#dcefe4]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[#303b36]">
          出生年份（可选）
        </label>

        <input
          type="text"
          inputMode="numeric"
          value={birthYear}
          onChange={(event) => setBirthYear(event.target.value)}
          placeholder="例如：1990"
          className="mt-2 w-full rounded-lg border border-[#c2d6cc] bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#0f6b45] focus:ring-2 focus:ring-[#dcefe4]"
        />
      </div>

      <button
        type="button"
        onClick={createCase}
        disabled={loading}
        className="rounded-lg bg-[#126e47] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0d5940] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "创建中..." : "创建病例"}
      </button>
    </div>
  )
}
