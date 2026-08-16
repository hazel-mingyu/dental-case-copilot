export type EvalReviewRow = {
  image_id: string
  review_status: string
  view_label: string | null
  reviewed_prediction_id: string | null
}

export type EvalPredictionRow = {
  id: string
  image_id: string
  view_prediction: string
  confidence: number | null
}

export type EvalImageRow = {
  id: string
  image_path: string
}

export type BadcaseType = "abstention" | "misclassification"

export type EvalSample = {
  image_id: string
  prediction_id: string
  image_path: string
  view_prediction: string
  confidence: number | null
  view_label: string
  is_correct: boolean
  badcase_type: BadcaseType | null
}

export type PerClassStatistic = {
  class: string
  support: number
  correct: number
  incorrect: number
  accuracy: number
}

export type EvalMetrics = {
  reviewed_sample_count: number
  overall_accuracy: number | null
  human_correction_rate: number | null
  abstention_rate: number | null
  per_class: PerClassStatistic[]
  badcases: EvalSample[]
}

export type EvalDataIntegrity = {
  manual_only_review_count: number
  missing_reviewed_prediction_reference_count: number
  missing_or_mismatched_prediction_count: number
  missing_image_count: number
  duplicate_review_image_count: number
}

export function buildEvalSamples(
  reviews: EvalReviewRow[],
  predictions: EvalPredictionRow[],
  images: EvalImageRow[]
) {
  const predictionsById = new Map(
    predictions.map((prediction) => [prediction.id, prediction])
  )
  const imagesById = new Map(images.map((image) => [image.id, image]))
  const reviewCountsByImageId = new Map<string, number>()

  for (const review of reviews) {
    reviewCountsByImageId.set(
      review.image_id,
      (reviewCountsByImageId.get(review.image_id) ?? 0) + 1
    )
  }

  const integrity: EvalDataIntegrity = {
    manual_only_review_count: 0,
    missing_reviewed_prediction_reference_count: 0,
    missing_or_mismatched_prediction_count: 0,
    missing_image_count: 0,
    duplicate_review_image_count: 0,
  }

  const samples: EvalSample[] = []

  for (const review of reviews) {
    if (!review.view_label) {
      continue
    }

    if ((reviewCountsByImageId.get(review.image_id) ?? 0) > 1) {
      integrity.duplicate_review_image_count += 1
      continue
    }

    if (!review.reviewed_prediction_id) {
      integrity.manual_only_review_count += 1
      continue
    }

    const prediction = predictionsById.get(review.reviewed_prediction_id)

    if (!prediction || prediction.image_id !== review.image_id) {
      integrity.missing_or_mismatched_prediction_count += 1
      continue
    }

    const image = imagesById.get(review.image_id)

    if (!image) {
      integrity.missing_image_count += 1
      continue
    }

    const isCorrect = prediction.view_prediction === review.view_label
    const badcaseType =
      prediction.view_prediction === "unknown"
        ? "abstention"
        : isCorrect
          ? null
          : "misclassification"

    samples.push({
      image_id: image.id,
      prediction_id: prediction.id,
      image_path: image.image_path,
      view_prediction: prediction.view_prediction,
      confidence: prediction.confidence,
      view_label: review.view_label,
      is_correct: isCorrect,
      badcase_type: badcaseType,
    })
  }

  return { samples, integrity }
}

export function calculateEvalMetrics(samples: EvalSample[]): EvalMetrics {
  const reviewedSampleCount = samples.length
  const correctCount = samples.filter((sample) => sample.is_correct).length
  const explicitPredictions = samples.filter(
    (sample) => sample.view_prediction !== "unknown"
  )
  const correctionCount = explicitPredictions.filter(
    (sample) => sample.view_prediction !== sample.view_label
  ).length
  const abstentionCount = samples.filter(
    (sample) => sample.view_prediction === "unknown"
  ).length
  const samplesByClass = new Map<string, EvalSample[]>()

  for (const sample of samples) {
    const classSamples = samplesByClass.get(sample.view_label) ?? []
    classSamples.push(sample)
    samplesByClass.set(sample.view_label, classSamples)
  }

  const perClass = Array.from(samplesByClass.entries())
    .map(([viewLabel, classSamples]) => {
      const correct = classSamples.filter((sample) => sample.is_correct).length

      return {
        class: viewLabel,
        support: classSamples.length,
        correct,
        incorrect: classSamples.length - correct,
        accuracy: correct / classSamples.length,
      }
    })
    .sort((left, right) => left.class.localeCompare(right.class))

  return {
    reviewed_sample_count: reviewedSampleCount,
    overall_accuracy:
      reviewedSampleCount === 0 ? null : correctCount / reviewedSampleCount,
    human_correction_rate:
      explicitPredictions.length === 0
        ? null
        : correctionCount / explicitPredictions.length,
    abstention_rate:
      reviewedSampleCount === 0
        ? null
        : abstentionCount / reviewedSampleCount,
    per_class: perClass,
    badcases: samples.filter((sample) => sample.badcase_type !== null),
  }
}
