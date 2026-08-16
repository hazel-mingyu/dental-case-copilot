import {
  STANDARD_PHOTO_VIEWS,
  type PhotoView,
} from "./photoViewTaxonomy"

export const PHOTO_VIEW_TAXONOMY_VERSION = "dental-photo-view-v1"
export const MOCK_PREDICTOR_VERSION = "mock-v1"

export type MockImagePrediction = {
  view_prediction: PhotoView
  confidence: number
  taxonomy_version: typeof PHOTO_VIEW_TAXONOMY_VERSION
  predictor_version: typeof MOCK_PREDICTOR_VERSION
}

function hashImageId(imageId: string) {
  let hash = 2166136261

  for (let index = 0; index < imageId.length; index++) {
    hash ^= imageId.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function createMockImagePrediction(
  imageId: string
): MockImagePrediction {
  const hash = hashImageId(imageId)

  if (hash % 5 === 0) {
    return {
      view_prediction: "unknown",
      confidence: Number((0.3 + (hash % 31) / 100).toFixed(2)),
      taxonomy_version: PHOTO_VIEW_TAXONOMY_VERSION,
      predictor_version: MOCK_PREDICTOR_VERSION,
    }
  }

  return {
    view_prediction: STANDARD_PHOTO_VIEWS[
      hash % STANDARD_PHOTO_VIEWS.length
    ],
    confidence: Number((0.7 + (hash % 26) / 100).toFixed(2)),
    taxonomy_version: PHOTO_VIEW_TAXONOMY_VERSION,
    predictor_version: MOCK_PREDICTOR_VERSION,
  }
}
