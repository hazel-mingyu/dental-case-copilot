import Link from "next/link"
import { supabase } from "../../lib/supabase"
import {
  VISION_PREDICTOR_VERSION,
  VISION_TAXONOMY_VERSION,
} from "../../lib/visionClassificationContract"
import {
  VISION_V2_PREDICTOR_VERSION,
  VISION_V2_TAXONOMY_VERSION,
} from "../../lib/visionClassificationContractV2"
import { getPhotoViewLabel } from "../../lib/photoViewTaxonomy"
import {
  buildEvalSamples,
  calculateEvalMetrics,
  type EvalImageRow,
  type EvalPredictionRow,
  type EvalReviewRow,
} from "../../lib/eval"

export const dynamic = "force-dynamic"

function formatRate(rate: number | null) {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`
}

function formatConfidence(confidence: number | null) {
  return confidence === null ? "—" : `${Math.round(confidence * 100)}%`
}

function getIntegrityMessageCount(integrity: ReturnType<typeof buildEvalSamples>["integrity"]) {
  return integrity.missing_reviewed_prediction_reference_count +
    integrity.missing_or_mismatched_prediction_count +
    integrity.missing_image_count +
    integrity.duplicate_review_image_count
}

const predictorVersions = {
  [VISION_PREDICTOR_VERSION]: VISION_TAXONOMY_VERSION,
  [VISION_V2_PREDICTOR_VERSION]: VISION_V2_TAXONOMY_VERSION,
} as const

export default async function EvalPage({
  searchParams,
}: {
  searchParams: Promise<{ predictor_version?: string }>
}) {
  const { predictor_version: requestedPredictorVersion } = await searchParams
  const predictorVersion =
    requestedPredictorVersion === VISION_PREDICTOR_VERSION
      ? VISION_PREDICTOR_VERSION
      : VISION_V2_PREDICTOR_VERSION
  const taxonomyVersion = predictorVersions[predictorVersion]
  const { data: reviewData, error: reviewError } = await supabase
    .from("image_reviews")
    .select("image_id,review_status,view_label,reviewed_prediction_id")
    .eq("review_status", "reviewed")
    .not("view_label", "is", null)

  if (reviewError) {
    return <EvalLoadError message={reviewError.message} />
  }

  const reviews = (reviewData ?? []) as EvalReviewRow[]
  const reviewedPredictionIds = reviews.flatMap((review) =>
    review.reviewed_prediction_id ? [review.reviewed_prediction_id] : []
  )
  const reviewedImageIds = reviews.map((review) => review.image_id)

  let predictions: EvalPredictionRow[] = []
  let images: EvalImageRow[] = []

  if (reviewedPredictionIds.length > 0) {
    const { data, error } = await supabase
      .from("image_predictions")
      .select("id,image_id,view_prediction,confidence")
      .in("id", reviewedPredictionIds)
      .eq("predictor_version", predictorVersion)
      .eq("taxonomy_version", taxonomyVersion)

    if (error) {
      return <EvalLoadError message={error.message} />
    }

    predictions = (data ?? []) as EvalPredictionRow[]
  }

  if (reviewedImageIds.length > 0) {
    const { data, error } = await supabase
      .from("case_images")
      .select("id,image_path")
      .in("id", reviewedImageIds)

    if (error) {
      return <EvalLoadError message={error.message} />
    }

    images = (data ?? []) as EvalImageRow[]
  }

  const { samples, integrity } = buildEvalSamples(reviews, predictions, images)
  const metrics = calculateEvalMetrics(samples)
  const integrityMessageCount = getIntegrityMessageCount(integrity)

  if (process.env.NODE_ENV === "development") {
    console.info("Vision eval lineage", {
      predictorVersion,
      samples: samples.map((sample) => ({
        imageId: sample.image_id,
        predictionId: sample.prediction_id,
        aiPrediction: sample.view_prediction,
        humanGroundTruth: sample.view_label,
        correct: sample.is_correct,
      })),
      integrity,
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-gray-500 hover:text-black">
          返回病例库
        </Link>

        <h1 className="mt-6 text-3xl font-bold">AI Eval</h1>
        <p className="mt-2 text-sm text-gray-500">
          {predictorVersion} · {taxonomyVersion} · 基于当前医生审核结果实时计算
        </p>
        <p className="mt-2 text-sm text-gray-500">
          <Link href="/eval?predictor_version=vision-v2" className="mr-3 underline">
            vision-v2
          </Link>
          <Link href="/eval?predictor_version=vision-v1" className="underline">
            vision-v1
          </Link>
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="已审核样本数" value={String(metrics.reviewed_sample_count)} />
          <MetricCard label="Overall Accuracy" value={formatRate(metrics.overall_accuracy)} />
          <MetricCard
            label="Human Correction Rate"
            value={formatRate(metrics.human_correction_rate)}
          />
          <MetricCard label="Abstention Rate" value={formatRate(metrics.abstention_rate)} />
        </section>

        {integrity.manual_only_review_count > 0 && (
          <p className="mt-4 text-sm text-gray-500">
            已排除 {integrity.manual_only_review_count} 条未审核 AI 建议的纯人工分类记录。
          </p>
        )}

        {integrityMessageCount > 0 && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            已排除 {integrityMessageCount} 条数据完整性异常记录（缺少审核引用 Prediction：
            {integrity.missing_reviewed_prediction_reference_count}；Prediction 不存在、版本不匹配或图片不匹配：
            {integrity.missing_or_mismatched_prediction_count}；缺少图片：
            {integrity.missing_image_count}；重复 image_id Review：
            {integrity.duplicate_review_image_count}）。
          </p>
        )}

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Per-class Statistics</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Class（Ground Truth）</th>
                  <th className="px-4 py-3 font-medium">Support</th>
                  <th className="px-4 py-3 font-medium">Correct</th>
                  <th className="px-4 py-3 font-medium">Incorrect</th>
                  <th className="px-4 py-3 font-medium">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {metrics.per_class.map((statistic) => (
                  <tr key={statistic.class} className="border-b last:border-0">
                    <td className="px-4 py-3">{getPhotoViewLabel(statistic.class)}</td>
                    <td className="px-4 py-3">{statistic.support}</td>
                    <td className="px-4 py-3">{statistic.correct}</td>
                    <td className="px-4 py-3">{statistic.incorrect}</td>
                    <td className="px-4 py-3">{formatRate(statistic.accuracy)}</td>
                  </tr>
                ))}
                {metrics.per_class.length === 0 && <EmptyRow colSpan={5} text="暂无可评估的已审核样本" />}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Badcase List</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">图片</th>
                  <th className="px-4 py-3 font-medium">Image ID</th>
                  <th className="px-4 py-3 font-medium">AI Prediction</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Ground Truth</th>
                  <th className="px-4 py-3 font-medium">Badcase Type</th>
                </tr>
              </thead>
              <tbody>
                {metrics.badcases.map((sample) => {
                  const { data } = supabase.storage
                    .from("case-images")
                    .getPublicUrl(sample.image_path)

                  return (
                    <tr key={sample.image_id} className="border-b last:border-0 align-middle">
                      <td className="px-4 py-3">
                        <img
                          src={data.publicUrl}
                          alt="Badcase 图片"
                          className="h-16 w-16 rounded object-cover"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{sample.image_id}</td>
                      <td className="px-4 py-3">{getPhotoViewLabel(sample.view_prediction)}</td>
                      <td className="px-4 py-3">{formatConfidence(sample.confidence)}</td>
                      <td className="px-4 py-3">{getPhotoViewLabel(sample.view_label)}</td>
                      <td className="px-4 py-3">{sample.badcase_type}</td>
                    </tr>
                  )
                })}
                {metrics.badcases.length === 0 && <EmptyRow colSpan={6} text="暂无 Badcase" />}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-gray-500">
        {text}
      </td>
    </tr>
  )
}

function EvalLoadError({ message }: { message: string }) {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Eval 加载失败</h1>
      <p className="mt-3 text-gray-500">{message}</p>
    </main>
  )
}
