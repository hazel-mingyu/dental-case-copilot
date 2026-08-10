export const caseTypeLabels = {
  orthodontics: "正畸",
  anterior_aesthetics: "前牙美学修复",
} as const

export type CaseType = keyof typeof caseTypeLabels

export function isCaseType(value: string): value is CaseType {
  return Object.hasOwn(caseTypeLabels, value)
}

export function getCaseTypeLabel(
  value: string | null | undefined
) {
  if (value && isCaseType(value)) {
    return caseTypeLabels[value]
  }

  return "未分类"
}
