import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET() {
  const { data: steps, error } = await supabaseServer
    .from('step_performance')
    .select('sequence_id, sequence_name, source, health_score_v2, flag_type, step_intent, health_gate_override')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by sequence
  const seqMap = new Map<string, {
    id: string
    name: string
    source: string
    steps: { health_score_v2: number; flag_type: string; step_intent: string | null; health_gate_override: boolean }[]
  }>()

  for (const row of steps) {
    if (!seqMap.has(row.sequence_id)) {
      seqMap.set(row.sequence_id, {
        id: row.sequence_id,
        name: row.sequence_name ?? row.sequence_id,
        source: row.source,
        steps: [],
      })
    }
    seqMap.get(row.sequence_id)!.steps.push({
      health_score_v2: Number(row.health_score_v2) || 0,
      flag_type: row.flag_type ?? 'none',
      step_intent: row.step_intent ?? null,
      health_gate_override: row.health_gate_override ?? false,
    })
  }

  const sequences = Array.from(seqMap.values()).map((seq) => {
    const avgHealth = seq.steps.reduce((s, st) => s + st.health_score_v2, 0) / seq.steps.length
    const hasGateOverride = seq.steps.some((st) => st.health_gate_override)

    // Tier thresholds calibrated to v2 distribution (min=0.4482, median=0.6410, max=1.01)
    let tier: 'green' | 'yellow' | 'red'
    if (hasGateOverride) {
      tier = 'red'
    } else if (avgHealth >= 0.70) {
      tier = 'green'
    } else if (avgHealth >= 0.50) {
      tier = 'yellow'
    } else {
      tier = 'red'
    }

    const flaggedCount = seq.steps.filter((st) => st.flag_type !== 'none').length

    return {
      id: seq.id,
      name: seq.name,
      source: seq.source,
      status: 'active',
      healthScore: Math.round(avgHealth * 1000) / 1000,
      tier,
      flaggedStepCount: flaggedCount,
      stepCount: seq.steps.length,
    }
  })

  // Sort by health score ascending (worst first)
  sequences.sort((a, b) => a.healthScore - b.healthScore)

  return NextResponse.json({ data: sequences })
}
