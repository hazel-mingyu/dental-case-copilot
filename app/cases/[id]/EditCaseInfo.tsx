"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { caseTypeLabels, isCaseType, getCaseTypeLabel, type CaseType } from "../../../lib/caseType"

type Props = { caseId: string; patientName: string | null; patientPhone: string | null; birthYear: number | null; caseType: string | null; createdAt: string; latestVisit: string; isTreatmentEnded: boolean }

function maskPhone(phone: string | null) { if (!phone) return "未填写"; return phone.length <= 7 ? `${phone.slice(0, 3)}****` : `${phone.slice(0, 3)}****${phone.slice(-4)}` }
function getAge(birthYear: number | null) { return birthYear ? `${new Date().getFullYear() - birthYear} 岁` : "未填写" }

export default function EditCaseInfo({ caseId, patientName: initialPatientName, patientPhone: initialPhone, birthYear: initialBirthYear, caseType: initialCaseType, createdAt, latestVisit, isTreatmentEnded }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false), [patientName, setPatientName] = useState(initialPatientName ?? ""), [phone, setPhone] = useState(initialPhone ?? ""), [birthYear, setBirthYear] = useState(initialBirthYear?.toString() ?? ""), [caseType, setCaseType] = useState(initialCaseType ?? ""), [saving, setSaving] = useState(false), [error, setError] = useState("")
  function cancel() { setPatientName(initialPatientName ?? ""); setPhone(initialPhone ?? ""); setBirthYear(initialBirthYear?.toString() ?? ""); setCaseType(initialCaseType ?? ""); setError(""); setEditing(false) }
  async function save() {
    const normalizedPatientName = patientName.trim(), normalizedBirthYear = birthYear.trim(), currentYear = new Date().getFullYear()
    if (!normalizedPatientName) return setError("请输入患者姓名")
    if (normalizedBirthYear && (!/^\d{4}$/.test(normalizedBirthYear) || Number(normalizedBirthYear) < 1900 || Number(normalizedBirthYear) > currentYear)) return setError(`请输入 1900-${currentYear} 之间的四位出生年份`)
    if (!isCaseType(caseType)) return setError("请选择系统支持的治疗类型")
    setSaving(true); setError("")
    const { error: updateError } = await supabase.from("cases").update({ patient_name: normalizedPatientName, patient_phone: phone.trim() || null, birth_year: normalizedBirthYear ? Number(normalizedBirthYear) : null, case_type: caseType as CaseType }).eq("id", caseId)
    setSaving(false)
    if (updateError) return setError(updateError.message)
    setEditing(false); router.refresh()
  }
  if (editing) return <div><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[#303b36]">编辑病例信息</h2><button type="button" onClick={cancel} disabled={saving} className="rounded-lg border border-[#c2d6cc] px-3 py-2 text-sm font-medium text-[#0f6b45]">取消</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-[#303b36]">患者姓名<input value={patientName} onChange={(event) => setPatientName(event.target.value)} className="mt-2 w-full rounded-lg border border-[#c2d6cc] px-3 py-2 outline-none focus:border-[#0f6b45]" /></label><label className="text-sm text-[#303b36]">电话<input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-lg border border-[#c2d6cc] px-3 py-2 outline-none focus:border-[#0f6b45]" /></label><label className="text-sm text-[#303b36]">出生年份<input inputMode="numeric" value={birthYear} onChange={(event) => setBirthYear(event.target.value)} className="mt-2 w-full rounded-lg border border-[#c2d6cc] px-3 py-2 outline-none focus:border-[#0f6b45]" placeholder="例如：1990" /></label><label className="text-sm text-[#303b36]">治疗类型<select value={caseType} onChange={(event) => setCaseType(event.target.value)} className="mt-2 w-full rounded-lg border border-[#c2d6cc] bg-white px-3 py-2 outline-none focus:border-[#0f6b45]"><option value="" disabled>请选择治疗类型</option>{Object.entries(caseTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{error && <p className="mt-3 text-sm text-red-700">{error}</p>}<button type="button" onClick={() => void save()} disabled={saving} className="mt-5 rounded-lg bg-[#126e47] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "保存中..." : "保存"}</button></div>
  return <div><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[#303b36]">患者信息</h2><button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-[#c2d6cc] px-3 py-2 text-sm font-medium text-[#0f6b45] hover:bg-[#ebf7f0]">编辑信息</button></div><dl className="mt-5 grid gap-x-8 gap-y-4 text-[13px] text-[#303b36] sm:grid-cols-2 lg:grid-cols-4"><div><dt className="inline text-[#597369]">电话：</dt><dd className="inline">{maskPhone(initialPhone)}</dd></div><div><dt className="inline text-[#597369]">出生年份：</dt><dd className="inline">{initialBirthYear || "未填写"}</dd></div><div><dt className="inline text-[#597369]">当前年龄：</dt><dd className="inline">{getAge(initialBirthYear)}</dd></div><div><dt className="inline text-[#597369]">治疗类型：</dt><dd className="inline">{getCaseTypeLabel(initialCaseType)}</dd></div><div><dt className="inline text-[#597369]">首次就诊：</dt><dd className="inline">{new Date(createdAt).toLocaleString("zh-CN")}</dd></div><div><dt className="inline text-[#597369]">最近就诊：</dt><dd className="inline">{new Date(latestVisit).toLocaleString("zh-CN")}</dd></div><div><dt className="inline text-[#597369]">病例状态：</dt><dd className="inline">{isTreatmentEnded ? "治疗已结束" : "治疗进行中"}</dd></div></dl></div>
}
