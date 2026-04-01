import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get('force') === 'true'

  // Check cache (24-hour window) unless force=true
  if (!force) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: cached } = await supabaseServer
      .from('org_summaries')
      .select('*')
      .gte('generated_at', cutoff)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (cached) {
      return NextResponse.json({ data: cached })
    }
  }

  // Compute live metrics
  const { data: steps, error } = await supabaseServer
    .from('step_performance')
    .select('sequence_id, reply_rate, pipeline_value, flag_type')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sequenceIds = new Set(steps.map((s) => s.sequence_id))
  const activeSequenceCount = sequenceIds.size

  const totalReply = steps.reduce((s, r) => s + (Number(r.reply_rate) || 0), 0)
  const orgAvgReplyRate = steps.length > 0 ? totalReply / steps.length : 0

  const totalPipeline = steps.reduce((s, r) => s + (Number(r.pipeline_value) || 0), 0)

  const flaggedCount = steps.filter(
    (r) => (r.flag_type ?? 'none') !== 'none'
  ).length

  const metrics = {
    activeSequenceCount,
    orgAvgReplyRate: Math.round(orgAvgReplyRate * 10000) / 10000,
    totalPipelineValue: Math.round(totalPipeline),
    flaggedStepCount: flaggedCount,
  }

  // Call Claude for summary
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are an AI analyst for a sales operations team. Based on these org-level metrics, write 2-3 sentences covering what is underperforming, why it is likely happening, and one or two specific recommended actions. Written for a RevOps lead or SDR manager. Plain English, no bullet points, no preamble.

Metrics:
- Active sequences: ${metrics.activeSequenceCount}
- Org average reply rate: ${(metrics.orgAvgReplyRate * 100).toFixed(2)}%
- Total pipeline influenced: $${metrics.totalPipelineValue.toLocaleString()}
- Flagged underperforming steps: ${metrics.flaggedStepCount} out of ${steps.length} total steps (Bayesian flagging at P > 0.80)`,
      },
    ],
  })

  const summaryText = message.content[0].type === 'text' ? message.content[0].text : ''

  // Store in org_summaries
  const { data: inserted, error: insertErr } = await supabaseServer
    .from('org_summaries')
    .insert({
      summary_text: summaryText,
      data_snapshot: metrics,
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ data: inserted })
}
