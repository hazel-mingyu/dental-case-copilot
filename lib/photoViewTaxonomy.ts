export const PHOTO_VIEW_LABELS = {
  intraoral_frontal: "正面咬合像",
  intraoral_right_buccal: "右侧侧位咬合像",
  intraoral_left_buccal: "左侧侧位咬合像",
  intraoral_maxillary_occlusal: "上颌牙弓（咬合面）像",
  intraoral_mandibular_occlusal: "下颌牙弓（咬合面）像",
  extraoral_frontal_relaxed: "正面照（放松）",
  extraoral_frontal_smile: "正面照（微笑）",
  extraoral_right_profile: "右侧貌照",
  extraoral_left_profile: "左侧貌照",
  unknown: "无法判断",
  other: "其他",
} as const

export type PhotoView = keyof typeof PHOTO_VIEW_LABELS

export const PHOTO_VIEW_OPTIONS = Object.entries(PHOTO_VIEW_LABELS).map(
  ([value, label]) => ({ value: value as PhotoView, label })
)

export type HumanReviewPhotoView = Exclude<PhotoView, "unknown">

export const PHOTO_VIEW_GROUPS = [
  {
    label: "面部",
    views: [
      "extraoral_frontal_relaxed",
      "extraoral_frontal_smile",
      "extraoral_right_profile",
      "extraoral_left_profile",
    ],
  },
  {
    label: "口内",
    views: [
      "intraoral_frontal",
      "intraoral_right_buccal",
      "intraoral_left_buccal",
      "intraoral_maxillary_occlusal",
      "intraoral_mandibular_occlusal",
    ],
  },
  { label: "其他", views: ["other"] },
] as const satisfies ReadonlyArray<{
  label: string
  views: readonly HumanReviewPhotoView[]
}>

export const HUMAN_REVIEW_PHOTO_VIEW_OPTIONS = PHOTO_VIEW_OPTIONS.filter(
  ({ value }) => value !== "unknown"
) as { value: HumanReviewPhotoView; label: string }[]

export function isHumanReviewPhotoView(
  value: string | null | undefined
): value is HumanReviewPhotoView {
  return Boolean(value && value in PHOTO_VIEW_LABELS && value !== "unknown")
}

export const STANDARD_PHOTO_VIEWS = PHOTO_VIEW_OPTIONS.filter(
  ({ value }) => value !== "unknown" && value !== "other"
).map(({ value }) => value)

export function getPhotoViewLabel(value: string | null | undefined) {
  if (!value || !(value in PHOTO_VIEW_LABELS)) {
    return "未分类"
  }

  return PHOTO_VIEW_LABELS[value as PhotoView]
}
