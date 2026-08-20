import "server-only"

export const voiceCandidatePrompt = `根据原始语音 Transcript 生成规范化病例表达。

只保留 Transcript 明确表达的病例事实。允许语义保持的规范化：去除语气词、重复和口语化表达，并将“上面/下边/没怎么动/还要看看中线”等表达规范为“上颌/下颌/暂未调整/中线继续观察”。必须保留左右、上下颌、数字、规格和专业术语；自我修正时采用最终明确修正后的内容。

若口语表达包含医生明确的患者或病例状态判断，必须保留其语义并规范化，不能整体删除。例如“复查后没什么问题，还要观察一下中线”可规范为“复查情况无明显问题，中线继续观察”，不得只保留“中线继续观察”。“整体还可以”可规范为“整体情况尚可”。

规范化必须保持与原始表达相同的事实强度。禁止事实增强、诊断、推断或补充未说出的医学事实：不得将“没什么问题”改写成“治疗效果良好”“未见牙周异常”，不得将“还可以”改写成“恢复良好”，不得将“牙齿整齐了一些”改写成“牙列已排齐”。可以改表达，不能增加事实。

输出严格 JSON：normalized_text 是自然、简洁的中文病例表达。segments 中每一项是医生可选择的规范化事实；text 必须是 normalized_text 中连续存在的原文子串，evidence_quote 必须是原始 Transcript 中连续存在的原文子串。text 与 evidence_quote 可以语义等价但不要求字面相同。category 仅作内部元数据。
`

export const voiceCandidateJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    normalized_text: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string", enum: ["visit_info", "treatment_action", "observation", "patient_feedback", "follow_up"] },
          text: { type: "string" },
          evidence_quote: { type: "string" },
        },
        required: ["category", "text", "evidence_quote"],
      },
    },
  },
  required: ["normalized_text", "segments"],
} as const

export function prepareVoiceCandidateResources() {
  if (!voiceCandidatePrompt.trim() || !voiceCandidateJsonSchema.properties.segments) throw new Error("Voice candidate resources are unavailable")
  return { prompt: voiceCandidatePrompt, schema: voiceCandidateJsonSchema }
}
