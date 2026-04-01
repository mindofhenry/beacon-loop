import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const force = request.nextUrl.searchParams.get('force') === 'true'

  // Check cache (24-hour window) unless force=true
  if (!force) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: cached } = await supabaseServer
      .from('sequence_summaries')
      .select('*')
      .eq('sequence_id', id)
      .gte('generated_at', cutoff)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (cached) {
      return NextResponse.json({ data: cached })
    }
  }

  // Fetch step-level metrics for this sequence
  const { data: steps, error } = await supabaseServer
    .from('step_performance')
    .select('step_number, step_type, send_volume, open_rate, reply_rate, meeting_rate, pipeline_value')
    .eq('sequence_id', id)
    .order('step_number', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!steps || steps.length === 0) {
    return NextResponse.json({ error: `No data for sequence ${id}` }, { status: 404 })
  }

  // Fetch flag info for severity context
  const { data: flagData } = await supabaseServer
    .from('step_performance')
    .select('step_number, flag_type, step_intent')
    .eq('sequence_id', id)
    .order('step_number', { ascending: true })

  const flagMap = new Map<number, { flag_type: string; step_intent: string | null }>()
  for (const f of flagData ?? []) {
    flagMap.set(f.step_number, { flag_type: f.flag_type ?? 'none', step_intent: f.step_intent })
  }

  // Build context for Claude
  const stepDetails = steps.map((s) => {
    const replyRate = Number(s.reply_rate) || 0
    const info = flagMap.get(s.step_number)
    const severity = info?.flag_type && info.flag_type !== 'none' ? 'FLAGGED' : 'OK'
    return { ...s, reply_rate: replyRate, severity, step_intent: info?.step_intent ?? null }
  })

  // Find steepest drop-off
  let steepestDrop = { from: 0, to: 0, delta: 0 }
  for (let i = 1; i < stepDetails.length; i++) {
    const delta = stepDetails[i - 1].reply_rate - stepDetails[i].reply_rate
    if (delta > steepestDrop.delta) {
      steepestDrop = { from: i, to: i + 1, delta }
    }
  }

  const flaggedSteps = stepDetails.filter((s) => s.severity === 'FLAGGED').length

  const promptContext = stepDetails
    .map(
      (s) =>
        `Step ${s.step_number} (${s.step_type}, intent=${s.step_intent ?? 'unknown'}): reply_rate=${(s.reply_rate * 100).toFixed(2)}%, status=${s.severity}`
    )
    .join('\n')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are an AI analyst for a sales operations team. Analyze this sequence and write 2-3 sentences covering what is underperforming, where the steepest drop-off is, and one or two specific recommended actions. Written for a RevOps lead or SDR manager. Plain English, no bullet points, no preamble.

Sequence: ${id}
Steps:
${promptContext}

Flagged steps (Bayesian P > 0.80): ${flaggedSteps}
Steepest drop-off: between Step ${steepestDrop.from} and Step ${steepestDrop.to} (${(steepestDrop.delta * 100).toFixed(2)}pp decline in reply rate)`,
      },
    ],
  })

  const summaryText = message.content[0].type === 'text' ? message.content[0].text : ''

  const { data: inserted, error: insertErr } = await supabaseServer
    .from('sequence_summaries')
    .insert({
      sequence_id: id,
      summary_text: summaryText,
      data_snapshot: { steps: stepDetails, flaggedSteps, steepestDrop },
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ data: inserted })
}
