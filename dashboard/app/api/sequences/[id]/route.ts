import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Fetch step_performance for this sequence — order by pipeline_run_id desc so
  // the latest run is first; we deduplicate below to one row per step_id.
  const { data: allPerfRows, error: perfError } = await supabaseServer
    .from('step_performance')
    .select('*')
    .eq('sequence_id', id)
    .order('pipeline_run_id', { ascending: false })

  if (perfError) {
    return NextResponse.json({ error: perfError.message }, { status: 500 })
  }
  if (!allPerfRows || allPerfRows.length === 0) {
    return NextResponse.json({ error: `No data for sequence ${id}` }, { status: 404 })
  }

  // Keep only the latest row per step_id (first seen wins because we ordered desc)
  const seenStepIds = new Set<string>()
  const perfRows = allPerfRows
    .filter((r) => {
      if (seenStepIds.has(r.step_id)) return false
      seenStepIds.add(r.step_id)
      return true
    })
    .sort((a, b) => a.step_number - b.step_number)

  // Fetch sequence_steps for subjects
  const stepIds = perfRows.map((r) => r.step_id)
  const { data: stepRows } = await supabaseServer
    .from('sequence_steps')
    .select('step_id, subject, body_text, step_type')
    .in('step_id', stepIds)

  const subjectMap = new Map<string, { subject: string; body_text: string | null; step_type: string }>()
  for (const row of stepRows ?? []) {
    subjectMap.set(row.step_id, { subject: row.subject, body_text: row.body_text ?? null, step_type: row.step_type })
  }

  const first = perfRows[0]
  const steps = perfRows.map((row) => {
    const flagType = row.flag_type ?? 'none'
    const severity = flagType !== 'none' ? 'FLAGGED' : 'OK'
    const stepInfo = subjectMap.get(row.step_id)

    return {
      step_id: row.step_id,
      step_number: row.step_number,
      step_type: stepInfo?.step_type ?? row.step_type,
      step_intent: row.step_intent ?? null,
      subject: stepInfo?.subject ?? null,
      body_text: stepInfo?.body_text ?? null,
      send_volume: row.send_volume,
      open_rate: Number(row.open_rate) || 0,
      reply_rate: Number(row.reply_rate) || 0,
      meeting_rate: Number(row.meeting_rate) || 0,
      pipeline_value: Number(row.pipeline_value) || 0,
      health_score_v2: Number(row.health_score_v2) || 0,
      flag_type: flagType,
      flag_confidence: row.flag_confidence != null ? Number(row.flag_confidence) : null,
      severity,
    }
  })

  return NextResponse.json({
    data: {
      sequence_id: id,
      sequence_name: first.sequence_name ?? id,
      source: first.source,
      steps,
    },
  })
}
