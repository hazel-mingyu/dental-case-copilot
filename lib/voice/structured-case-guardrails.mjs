const visitEvidence = /初诊|首次就诊|第一次来看|复诊|第[一二三四五六七八九十百\d]+次复诊/
const followUpEvidence = /下次|下周|下个月|以后|之后|计划|再观察|继续观察|下次复诊|下个月复诊|再决定/
const instructionEvidence = /继续佩戴|加强佩戴|保证佩戴时间|晚上尽量佩戴|需要继续戴|继续戴|佩戴橡皮筋/

function clone(value) { return JSON.parse(JSON.stringify(value)) }

export function applyStructuredCaseGuardrails(transcript, rawStructuredResult) {
  const result = clone(rawStructuredResult)
  const guardrailEvents = []
  if (result.visit_type !== null && !visitEvidence.test(transcript)) {
    guardrailEvents.push({ rule: "unsupported_visit_type_removed", before: result.visit_type, after: null })
    result.visit_type = null
  }
  if (result.follow_up_plan.length && !followUpEvidence.test(transcript)) {
    guardrailEvents.push({ rule: "unsupported_follow_up_removed", before: JSON.stringify(result.follow_up_plan), after: "[]" })
    result.follow_up_plan = []
  }
  const retainedFeedback = []
  for (const feedback of result.patient_feedback) {
    if (instructionEvidence.test(feedback.content)) {
      const action = { action: feedback.content, site: null, details: feedback.current_status }
      result.treatment_actions.push(action)
      guardrailEvents.push({ rule: "patient_feedback_reclassified_to_action", before: JSON.stringify(feedback), after: JSON.stringify(action) })
    } else retainedFeedback.push(feedback)
  }
  result.patient_feedback = retainedFeedback
  return { finalStructuredResult: result, guardrailEvents }
}
