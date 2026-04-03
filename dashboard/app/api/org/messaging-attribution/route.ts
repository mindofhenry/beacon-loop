import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get('days')
  const days = daysParam ? parseInt(daysParam, 10) : 90

  // Calculate cutoff date
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { data: steps, error } = await supabaseServer
    .from('step_performance')
    .select(
      'messaging_theme, pipeline_value, reply_rate, meeting_rate, meeting_count'
    )
    .not('messaging_theme', 'is', null)
    .gte('snapshot_date', cutoff)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by messaging_theme
  const grouped: Record<
    string,
    {
      step_count: number
      total_pipeline_value: number
      reply_rate_sum: number
      meeting_rate_sum: number
      meeting_count: number
    }
  > = {}

  for (const row of steps) {
    const theme = row.messaging_theme as string
    if (!grouped[theme]) {
      grouped[theme] = {
        step_count: 0,
        total_pipeline_value: 0,
        reply_rate_sum: 0,
        meeting_rate_sum: 0,
        meeting_count: 0,
      }
    }
    const g = grouped[theme]
    g.step_count += 1
    g.total_pipeline_value += Number(row.pipeline_value) || 0
    g.reply_rate_sum += Number(row.reply_rate) || 0
    g.meeting_rate_sum += Number(row.meeting_rate) || 0
    g.meeting_count += Number(row.meeting_count) || 0
  }

  const result = Object.entries(grouped).map(([theme, g]) => ({
    theme,
    step_count: g.step_count,
    total_pipeline_value: Math.round(g.total_pipeline_value * 100) / 100,
    avg_reply_rate:
      g.step_count > 0
        ? Math.round((g.reply_rate_sum / g.step_count) * 10000) / 10000
        : 0,
    avg_meeting_rate:
      g.step_count > 0
        ? Math.round((g.meeting_rate_sum / g.step_count) * 10000) / 10000
        : 0,
    meeting_count: g.meeting_count,
  }))

  // Sort by total_pipeline_value descending
  result.sort((a, b) => b.total_pipeline_value - a.total_pipeline_value)

  return NextResponse.json({ data: result, days, total_steps: steps.length })
}
