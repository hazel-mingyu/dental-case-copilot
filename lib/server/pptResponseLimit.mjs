export const MAX_PPT_RESPONSE_BYTES = 4 * 1024 * 1024
export const PPT_RESPONSE_TOO_LARGE_STATUS = 413
export const PPT_RESPONSE_TOO_LARGE_ERROR = "生成的PPT文件过大，请减少所选图片数量后重试。"

export function pptResponseSizeError(byteLength) {
  return byteLength > MAX_PPT_RESPONSE_BYTES ? PPT_RESPONSE_TOO_LARGE_ERROR : null
}
