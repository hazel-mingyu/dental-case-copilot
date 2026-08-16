function confirmedContents(value) {
  return Array.isArray(value)
    ? value.flatMap((segment) => typeof segment?.content === "string" && segment.content.trim() ? [segment.content.trim()] : [])
    : []
}

export async function buildCaseSummaryInput(supabase, caseId) {
  const { data: timepoints, error: timepointsError } = await supabase
    .from("case_timepoints")
    .select("id,sequence_order,captured_on,is_final")
    .eq("case_id", caseId)
    .not("completed_at", "is", null)
    .order("sequence_order", { ascending: true })
  if (timepointsError) throw timepointsError

  const completed = timepoints ?? []
  if (!completed.length) return { case_id: caseId, summary_mode: "initial", timepoints: [] }

  const { data: notes, error: notesError } = await supabase
    .from("case_voice_notes")
    .select("timepoint_id,created_at,confirmed_segments")
    .eq("case_id", caseId)
    .in("timepoint_id", completed.map((timepoint) => timepoint.id))
    .order("created_at", { ascending: true })
  if (notesError) throw notesError

  const textByTimepoint = new Map()
  for (const note of notes ?? []) {
    const contents = confirmedContents(note.confirmed_segments)
    if (contents.length) textByTimepoint.set(note.timepoint_id, [...(textByTimepoint.get(note.timepoint_id) ?? []), ...contents])
  }

  const inputTimepoints = completed.flatMap((timepoint) => {
    const contents = textByTimepoint.get(timepoint.id) ?? []
    return contents.length ? [{ timepoint_id: timepoint.id, sequence_order: timepoint.sequence_order, captured_on: timepoint.captured_on, confirmed_text: contents.join("\n") }] : []
  })
  const validTimepointIds = new Set(inputTimepoints.map((timepoint) => timepoint.timepoint_id))
  const isFinal = completed.some((timepoint) => validTimepointIds.has(timepoint.id) && timepoint.is_final === true)
  const summary_mode = isFinal ? "completed" : inputTimepoints.length <= 1 ? "initial" : "ongoing"
  return { case_id: caseId, summary_mode, timepoints: inputTimepoints }
}
