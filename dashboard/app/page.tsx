'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, Sparkles, Users, BarChart3, RefreshCw, Copy, Check, Zap } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useRole } from '@/context/RoleContext'
import { useRewriteDrawer } from '@/context/RewriteDrawerContext'

// ─── Types ─────────────────────────────────────────────────────────────────

type KpiData = {
  activeSequences: number
  avgReplyRate: number
  pipelineInfluenced: number
  flaggedSteps: number
}

type StepPerfRow = {
  id: string
  step_id: string
  sequence_id: string
  sequence_name: string | null
  step_number: number
  step_type: string | null
  step_intent: string | null
  reply_rate: number | null
  open_rate: number | null
  send_volume: number
  pipeline_value: number | null
  flag_type: string | null
  flag_confidence: number | null
  messaging_theme: string | null
  rep_id: number | null
}

type RepRow = {
  id: number
  name: string
  team: string
}

type CoachingRow = {
  repId: number
  repName: string
  team: string
  flaggedCount: number
  worstReplyRate: number | null
  worstStepId: string | null
  worstStepLabel: string
}

type ThemeAttribution = {
  theme: string
  total_pipeline_value: number
  step_count: number
}

type FlaggedStep = {
  stepId: string
  sequenceName: string
  stepNumber: number
  stepType: string | null
  stepIntent: string | null
  replyRate: number | null
  flagType: string
  flagConfidence: number | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function fmtPipeline(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

function themeLabel(theme: string): string {
  return theme.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function severityFromConfidence(confidence: number | null): 'high' | 'medium' | 'low' {
  if (confidence == null) return 'low'
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

const severityColors: Record<string, { bg: string; color: string; border: string }> = {
  high: { bg: '#FEE2E2', color: '#DC2626', border: '#DC2626' },
  medium: { bg: '#FEF3C7', color: '#F59E0B', border: '#F59E0B' },
  low: { bg: '#F5F5F5', color: '#737373', border: '#D4D4D4' },
}

const themeColors = ['#2563EB', '#16A34A', '#F59E0B', '#7C3AED', '#DC2626']

// ─── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, subLabel }: { label: string; value: string; subLabel: string }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '2px solid #1A1A1A',
        borderRadius: '7px',
        padding: '10px 12px',
        boxShadow: '4px 4px 0px #1A1A1A',
      }}
    >
      <div
        className="font-mono text-[11px] uppercase"
        style={{ letterSpacing: '0.08em', color: '#737373', marginBottom: '5px' }}
      >
        {label}
      </div>
      <div
        className="font-mono text-[29px] font-medium"
        style={{ color: '#1A1A1A', letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      <div className="font-mono text-[11px]" style={{ color: '#A3A3A3', marginTop: '3px' }}>
        {subLabel}
      </div>
    </div>
  )
}

// ─── Section Header ────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span style={{ color: '#737373' }}>{icon}</span>
      <span
        className="font-mono text-[11px] uppercase"
        style={{ letterSpacing: '0.08em', color: '#737373' }}
      >
        {label}
      </span>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { role } = useRole()
  const { openDrawer } = useRewriteDrawer()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<KpiData | null>(null)
  const [coachingQueue, setCoachingQueue] = useState<CoachingRow[]>([])
  const [themeData, setThemeData] = useState<ThemeAttribution[]>([])
  const [flaggedSteps, setFlaggedSteps] = useState<FlaggedStep[]>([])
  const [currentRepName, setCurrentRepName] = useState<string>('')

  // LLM panel state
  const [quickActions, setQuickActions] = useState<string[]>([])
  const [quickActionsLoading, setQuickActionsLoading] = useState(false)
  const [orgIntel, setOrgIntel] = useState<string[]>([])
  const [orgIntelLoading, setOrgIntelLoading] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // Store raw data for LLM context
  const [rawFlaggedData, setRawFlaggedData] = useState<string>('')
  const [rawPerfData, setRawPerfData] = useState<string>('')

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Fetch step_performance, reps, and attribution credits in parallel
    const [perfResult, repsResult, creditsResult] = await Promise.all([
      supabase
        .from('step_performance')
        .select('id, step_id, sequence_id, sequence_name, step_number, step_type, step_intent, reply_rate, open_rate, send_volume, pipeline_value, flag_type, flag_confidence, messaging_theme, rep_id'),
      supabase
        .from('reps')
        .select('id, name, team'),
      supabase
        .from('step_attribution_credit')
        .select('step_id, opportunity_id, opportunity_amount'),
    ])

    const steps: StepPerfRow[] = (perfResult.data ?? []) as StepPerfRow[]
    const reps: RepRow[] = (repsResult.data ?? []) as RepRow[]
    const credits = (creditsResult.data ?? []) as { step_id: string; opportunity_id: string; opportunity_amount: number | null }[]
    const repMap = new Map(reps.map((r) => [r.id, r]))

    // ── KPIs ──
    const sequenceIds = new Set(steps.map((s) => s.sequence_id))
    const replyRates = steps.map((s) => Number(s.reply_rate) || 0)
    const avgReply = replyRates.length > 0 ? replyRates.reduce((a, b) => a + b, 0) / replyRates.length : 0
    // Deduplicated pipeline: sum each opportunity's amount exactly once
    const oppAmounts = new Map<string, number>()
    for (const c of credits) {
      if (c.opportunity_id && c.opportunity_amount != null && !oppAmounts.has(c.opportunity_id)) {
        oppAmounts.set(c.opportunity_id, Number(c.opportunity_amount))
      }
    }
    const totalPipeline = Array.from(oppAmounts.values()).reduce((a, b) => a + b, 0)
    const flaggedCount = steps.filter((s) => s.flag_type != null).length

    setKpis({
      activeSequences: sequenceIds.size,
      avgReplyRate: avgReply,
      pipelineInfluenced: totalPipeline,
      flaggedSteps: flaggedCount,
    })

    // ── Coaching Queue (Manager) ──
    const flaggedByRep = new Map<number, { steps: StepPerfRow[] }>()
    for (const s of steps) {
      if (s.flag_type == null || s.rep_id == null) continue
      if (!flaggedByRep.has(s.rep_id)) flaggedByRep.set(s.rep_id, { steps: [] })
      flaggedByRep.get(s.rep_id)!.steps.push(s)
    }

    const queue: CoachingRow[] = []
    for (const [repId, data] of flaggedByRep) {
      const rep = repMap.get(repId)
      if (!rep) continue
      let worstRate: number | null = null
      let worstStepId: string | null = null
      let worstLabel = ''
      for (const s of data.steps) {
        const rate = Number(s.reply_rate) ?? null
        if (worstRate === null || rate < worstRate) {
          worstRate = rate
          worstStepId = s.step_id
          worstLabel = `${s.sequence_name ?? s.sequence_id} — Step ${s.step_number}`
        }
      }
      queue.push({
        repId: rep.id,
        repName: rep.name,
        team: rep.team,
        flaggedCount: data.steps.length,
        worstReplyRate: worstRate,
        worstStepId,
        worstStepLabel: worstLabel,
      })
    }
    queue.sort((a, b) => b.flaggedCount - a.flaggedCount)
    setCoachingQueue(queue)

    // ── Messaging Attribution (RevOps) ──
    // Build lookup: step_performance UUID → messaging_theme
    const stepThemeMap = new Map<string, string>()
    for (const s of steps) {
      if (s.messaging_theme) stepThemeMap.set(s.id, s.messaging_theme)
    }
    // Deduplicate: count each opportunity once per theme (via the step it credited)
    const themeOppSeen = new Map<string, Set<string>>()
    const themeMap = new Map<string, { pipeline: number; count: number }>()
    for (const c of credits) {
      const theme = stepThemeMap.get(c.step_id)
      if (!theme || c.opportunity_amount == null) continue
      if (!themeOppSeen.has(theme)) themeOppSeen.set(theme, new Set())
      if (themeOppSeen.get(theme)!.has(c.opportunity_id)) continue
      themeOppSeen.get(theme)!.add(c.opportunity_id)
      const existing = themeMap.get(theme) ?? { pipeline: 0, count: 0 }
      existing.pipeline += Number(c.opportunity_amount)
      existing.count += 1
      themeMap.set(theme, existing)
    }
    // Also count steps per theme for the label
    const stepsPerTheme = new Map<string, number>()
    for (const s of steps) {
      if (s.messaging_theme) stepsPerTheme.set(s.messaging_theme, (stepsPerTheme.get(s.messaging_theme) ?? 0) + 1)
    }
    const themes: ThemeAttribution[] = Array.from(themeMap.entries())
      .map(([theme, d]) => ({ theme, total_pipeline_value: d.pipeline, step_count: stepsPerTheme.get(theme) ?? d.count }))
      .sort((a, b) => b.total_pipeline_value - a.total_pipeline_value)
    setThemeData(themes)

    // ── My Flagged Steps (Rep) ──
    // TODO: Wire to real rep identity when auth is implemented.
    // For now, pick the rep with the most flagged steps to make it interesting.
    const topRep = queue[0]
    if (topRep) {
      setCurrentRepName(topRep.repName)
      const mySteps = steps
        .filter((s) => s.flag_type != null && s.rep_id === topRep.repId)
        .sort((a, b) => (Number(a.reply_rate) || 0) - (Number(b.reply_rate) || 0))
        .map((s) => ({
          stepId: s.step_id,
          sequenceName: s.sequence_name ?? s.sequence_id,
          stepNumber: s.step_number,
          stepType: s.step_type,
          stepIntent: s.step_intent,
          replyRate: Number(s.reply_rate) ?? null,
          flagType: s.flag_type!,
          flagConfidence: s.flag_confidence,
        }))
      setFlaggedSteps(mySteps)
    }

    // ── Store context for LLM panels ──
    const flagged = steps.filter((s) => s.flag_type != null)
    const flaggedContext = flagged.map((s) => {
      const rep = s.rep_id ? repMap.get(s.rep_id) : null
      return `- ${s.sequence_name ?? s.sequence_id} Step ${s.step_number} (${s.step_type ?? 'email'}, ${s.step_intent ?? 'unknown'}): reply ${(Number(s.reply_rate) * 100).toFixed(1)}%, flag: ${s.flag_type}${s.flag_confidence ? ` (${(s.flag_confidence * 100).toFixed(0)}% confidence)` : ''}, theme: ${s.messaging_theme ?? 'none'}${rep ? `, rep: ${rep.name}` : ''}`
    }).join('\n')
    setRawFlaggedData(flaggedContext)

    const perfContext = [
      `Total sequences: ${sequenceIds.size}`,
      `Total steps: ${steps.length}`,
      `Avg reply rate: ${(avgReply * 100).toFixed(1)}%`,
      `Pipeline influenced: $${totalPipeline.toLocaleString()}`,
      `Flagged steps: ${flaggedCount}`,
      `\nPerformance by messaging theme:`,
      ...themes.map((t) => `- ${t.theme}: $${t.total_pipeline_value.toLocaleString()} pipeline, ${t.step_count} steps`),
      `\nCoaching queue:`,
      ...queue.map((q) => `- ${q.repName} (${q.team}): ${q.flaggedCount} flagged, worst reply ${q.worstReplyRate != null ? (q.worstReplyRate * 100).toFixed(1) + '%' : 'N/A'} at ${q.worstStepLabel}`),
    ].join('\n')
    setRawPerfData(perfContext)

    setLoading(false)
  }, [])

  // ── LLM fetch: Quick Actions (Manager) ──
  const fetchQuickActions = useCallback(async () => {
    if (!rawFlaggedData) return
    setQuickActionsLoading(true)
    try {
      const res = await fetch('/api/ask-beacon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Based on the following flagged step data, give me 3-5 specific, actionable coaching recommendations. Each should name the specific sequence, step number, and metric, and suggest what to do. Be concise — one sentence per action. Return ONLY a JSON array of strings, each string being one action item. No other text.',
          context: rawFlaggedData,
        }),
      })
      const data = await res.json()
      if (data.text) {
        try {
          const match = data.text.match(/\[[\s\S]*\]/)
          const actions: string[] = match ? JSON.parse(match[0]) : [data.text]
          setQuickActions(actions.slice(0, 5))
        } catch {
          setQuickActions(data.text.split('\n').filter((l: string) => l.trim().length > 0).slice(0, 5))
        }
      }
    } catch {
      setQuickActions(['Failed to load recommendations. Click refresh to try again.'])
    }
    setQuickActionsLoading(false)
  }, [rawFlaggedData])

  // ── LLM fetch: Org Intelligence (RevOps) ──
  const fetchOrgIntel = useCallback(async () => {
    if (!rawPerfData) return
    setOrgIntelLoading(true)
    try {
      const res = await fetch('/api/ask-beacon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Based on the following sequence performance and attribution data, give me your top 3 strategic recommendations for this org\'s outbound program. Each recommendation should be specific (name sequences, themes, or metrics), actionable, and one paragraph max. Return ONLY a JSON array of 3 strings. No other text.',
          context: rawPerfData,
        }),
      })
      const data = await res.json()
      if (data.text) {
        try {
          const match = data.text.match(/\[[\s\S]*\]/)
          const recs: string[] = match ? JSON.parse(match[0]) : [data.text]
          setOrgIntel(recs.slice(0, 3))
        } catch {
          setOrgIntel(data.text.split('\n\n').filter((l: string) => l.trim().length > 0).slice(0, 3))
        }
      }
    } catch {
      setOrgIntel(['Failed to load recommendations. Click refresh to try again.'])
    }
    setOrgIntelLoading(false)
  }, [rawPerfData])

  // Auto-fetch LLM data when raw data is available
  useEffect(() => {
    if (rawFlaggedData && role === 'manager' && quickActions.length === 0 && !quickActionsLoading) {
      fetchQuickActions()
    }
  }, [rawFlaggedData, role, quickActions.length, quickActionsLoading, fetchQuickActions])

  useEffect(() => {
    if (rawPerfData && role === 'revops' && orgIntel.length === 0 && !orgIntelLoading) {
      fetchOrgIntel()
    }
  }, [rawPerfData, role, orgIntel.length, orgIntelLoading, fetchOrgIntel])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  // ── Role-specific greeting ──
  const greeting: Record<string, string> = {
    manager: 'What needs your attention today',
    revops: 'Org-wide sequence intelligence',
    rep: 'Your steps that need work',
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="font-sans text-[24px] font-semibold text-[#1A1A1A] mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Overview</h1>
        <div className="border-b border-[#E5E5E5] mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-[#E5E5E5] rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin" style={{ color: '#A3A3A3' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page title */}
      <h1 className="font-sans text-[24px] font-semibold text-[#1A1A1A] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Overview</h1>
      <p className="font-sans text-[15px] mb-4" style={{ color: '#737373' }}>
        {greeting[role]}
      </p>
      <div className="border-b border-[#E5E5E5] mb-6" />

      {/* ── KPI Cards (all roles) ── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Active Sequences"
            value={String(kpis.activeSequences)}
            subLabel="outreach + salesloft"
          />
          <KpiCard
            label="Avg Reply Rate"
            value={fmt(kpis.avgReplyRate)}
            subLabel="reply / sends"
          />
          <KpiCard
            label="Pipeline Influenced"
            value={fmtPipeline(kpis.pipelineInfluenced)}
            subLabel="u-shaped attribution"
          />
          <KpiCard
            label="Flagged Steps"
            value={String(kpis.flaggedSteps)}
            subLabel="below threshold"
          />
        </div>
      )}

      {/* ── Manager: Quick Actions + Coaching Queue ── */}
      {role === 'manager' && (
        <>
          {/* Quick Actions — ABOVE coaching queue */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap size={15} style={{ color: '#F59E0B' }} />
                <span
                  className="font-mono text-[11px] uppercase"
                  style={{ letterSpacing: '0.08em', color: '#737373' }}
                >
                  Quick Actions
                </span>
              </div>
              <button
                onClick={() => { setQuickActions([]); fetchQuickActions() }}
                disabled={quickActionsLoading}
                className="flex items-center gap-1.5 font-mono text-[11px] uppercase px-2.5 py-1 rounded transition-colors duration-150"
                style={{
                  letterSpacing: '0.06em',
                  color: quickActionsLoading ? '#A3A3A3' : '#737373',
                  background: '#FFFFFF',
                  border: '2px solid #1A1A1A',
                  cursor: quickActionsLoading ? 'default' : 'pointer',
                }}
              >
                <RefreshCw size={12} className={quickActionsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {quickActionsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg animate-pulse"
                    style={{ background: '#F5F5F5', border: '2px solid #1A1A1A' }}
                  />
                ))}
              </div>
            ) : quickActions.length > 0 ? (
              <div className="space-y-2">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => router.push('/insights')}
                    className="w-full text-left rounded-lg px-4 py-3 transition-colors duration-100"
                    style={{ background: '#FFFFFF', border: '2px solid #1A1A1A', boxShadow: '4px 4px 0px #1A1A1A' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1A1A1A' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1A1A1A' }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="font-mono text-[13px] font-medium mt-0.5 shrink-0"
                        style={{ color: '#F59E0B' }}
                      >
                        {i + 1}.
                      </span>
                      <span className="font-sans text-[15px] text-[#1A1A1A] leading-relaxed">
                        {action}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div
                className="rounded-lg p-4 text-center"
                style={{ background: '#FFFFFF', border: '2px dashed #1A1A1A' }}
              >
                <p className="font-sans text-[15px]" style={{ color: '#737373' }}>
                  Click refresh to generate coaching recommendations
                </p>
              </div>
            )}
          </div>

          {/* Coaching Queue */}
          <SectionHeader icon={<Users size={15} />} label="Coaching Queue" />
          {coachingQueue.length > 0 ? (
            <div
              className="rounded-lg overflow-hidden mb-6"
              style={{ border: '2px solid #1A1A1A' }}
            >
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#FFFFFF' }}>
                    {['Rep', 'Team', 'Flagged Steps', 'Worst Step', 'Reply Rate'].map((h) => (
                      <th
                        key={h}
                        className="font-mono text-[11px] uppercase text-left px-4 py-3"
                        style={{ letterSpacing: '0.08em', color: '#737373', borderBottom: '1px solid #E5E5E5' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coachingQueue.map((row) => (
                    <tr
                      key={row.repId}
                      className="cursor-pointer transition-colors duration-100"
                      style={{ borderBottom: '1px solid #E5E5E5' }}
                      onClick={() => router.push('/insights')}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <td className="px-4 py-3 font-sans text-[15px] text-[#1A1A1A]">
                        {row.repName}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-[#737373]">
                        {row.team}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-[15px] font-medium"
                          style={{ color: row.flaggedCount >= 15 ? '#DC2626' : row.flaggedCount >= 10 ? '#F59E0B' : '#525252' }}
                        >
                          {row.flaggedCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-sans text-[13px] text-[#525252]" style={{ maxWidth: '260px' }}>
                        <span className="truncate block">{row.worstStepLabel}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[15px]" style={{ color: '#DC2626' }}>
                        {fmt(row.worstReplyRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="font-sans text-[15px] text-[#737373] mb-6">No flagged steps found.</p>
          )}
        </>
      )}

      {/* ── RevOps: Messaging Attribution Chart ── */}
      {role === 'revops' && (
        <>
          <SectionHeader icon={<BarChart3 size={15} />} label="Pipeline by Messaging Theme" />
          {themeData.length > 0 ? (
            <div
              className="rounded-lg p-5 mb-6"
              style={{ background: '#FFFFFF', border: '2px solid #1A1A1A' }}
            >
              <ResponsiveContainer width="100%" height={Math.max(200, themeData.length * 52)}>
                <BarChart
                  data={themeData.map((d) => ({
                    name: themeLabel(d.theme),
                    pipeline: Math.round(d.total_pipeline_value),
                    steps: d.step_count,
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: '#737373', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}
                    axisLine={{ stroke: '#E5E5E5' }}
                    tickLine={false}
                    tickFormatter={(v: number) => fmtPipeline(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fill: '#525252', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}
                    axisLine={{ stroke: '#E5E5E5' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #1A1A1A',
                      borderRadius: '8px',
                      fontFamily: "'Satoshi', sans-serif",
                      fontSize: '15px',
                    }}
                    labelStyle={{ color: '#1A1A1A', fontFamily: "'JetBrains Mono', monospace" }}
                    formatter={(value, _name, props) => {
                      const v = Number(value) || 0
                      const p = props?.payload as { steps?: number } | undefined
                      return [`${fmtPipeline(v)} (${p?.steps ?? 0} steps)`, 'Pipeline']
                    }}
                  />
                  <Bar dataKey="pipeline" radius={[0, 4, 4, 0]}>
                    {themeData.map((_, index) => (
                      <Cell key={index} fill={themeColors[index % themeColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="font-sans text-[15px] text-[#737373] mb-6">No messaging theme data found.</p>
          )}

          {/* Org Intelligence — live LLM section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={15} style={{ color: '#7C3AED' }} />
                <span
                  className="font-mono text-[11px] uppercase"
                  style={{ letterSpacing: '0.08em', color: '#737373' }}
                >
                  Org Intelligence
                </span>
              </div>
              <button
                onClick={() => { setOrgIntel([]); fetchOrgIntel() }}
                disabled={orgIntelLoading}
                className="flex items-center gap-1.5 font-mono text-[11px] uppercase px-2.5 py-1 rounded transition-colors duration-150"
                style={{
                  letterSpacing: '0.06em',
                  color: orgIntelLoading ? '#A3A3A3' : '#737373',
                  background: '#FFFFFF',
                  border: '2px solid #1A1A1A',
                  cursor: orgIntelLoading ? 'default' : 'pointer',
                }}
              >
                <RefreshCw size={12} className={orgIntelLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {orgIntelLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 rounded-lg animate-pulse"
                    style={{ background: '#F5F5F5', border: '2px solid #1A1A1A' }}
                  />
                ))}
              </div>
            ) : orgIntel.length > 0 ? (
              <div className="space-y-3">
                {orgIntel.map((rec, i) => (
                  <div
                    key={i}
                    className="rounded-lg px-4 py-3"
                    style={{ background: '#FFFFFF', border: '2px solid #1A1A1A' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className="font-mono text-[13px] font-medium mt-0.5 shrink-0"
                          style={{ color: '#7C3AED' }}
                        >
                          {i + 1}.
                        </span>
                        <p className="font-sans text-[15px] text-[#1A1A1A] leading-relaxed">
                          {rec}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopy(rec, i)}
                        className="shrink-0 p-1.5 rounded transition-colors duration-150"
                        style={{ color: copiedIdx === i ? '#16A34A' : '#737373', background: 'transparent' }}
                        title="Copy to clipboard"
                      >
                        {copiedIdx === i ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="rounded-lg p-4 text-center"
                style={{ background: '#FFFFFF', border: '2px dashed #1A1A1A' }}
              >
                <p className="font-sans text-[15px]" style={{ color: '#737373' }}>
                  Click refresh to generate strategic recommendations
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Rep: My Flagged Steps ── */}
      {role === 'rep' && (
        <>
          {/* TODO: Spec says Quick Actions for Rep role. Skipped — the flagged steps list sorted by severity + rewrite drawer access is already the rep's action list. Add LLM quick actions here when reps have enough data to warrant AI prioritization. */}
          <SectionHeader
            icon={<AlertTriangle size={15} />}
            label={`My Flagged Steps${currentRepName ? ` — ${currentRepName}` : ''}`}
          />
          {flaggedSteps.length > 0 ? (
            <div className="space-y-2 mb-6">
              {flaggedSteps.map((step) => {
                const sev = severityFromConfidence(step.flagConfidence)
                const sevStyle = severityColors[sev]
                return (
                  <button
                    key={step.stepId}
                    onClick={() => openDrawer(step.stepId)}
                    className="w-full text-left rounded-lg p-4 transition-colors duration-100 cursor-pointer"
                    style={{
                      background: '#FFFFFF',
                      border: '2px solid #1A1A1A',
                      boxShadow: '4px 4px 0px #1A1A1A',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1A1A1A' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1A1A1A' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-[15px] text-[#1A1A1A]">
                          {step.sequenceName}
                        </span>
                        <span className="font-mono text-[13px] text-[#737373]">
                          Step {step.stepNumber}
                        </span>
                      </div>
                      <span
                        className="font-mono text-[11px] px-2 py-0.5 rounded uppercase"
                        style={{ background: sevStyle.bg, color: sevStyle.color, border: `1px solid ${sevStyle.border}` }}
                      >
                        {sev}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-[13px]" style={{ color: '#DC2626' }}>
                        {fmt(step.replyRate)} reply
                      </span>
                      {step.stepType && (
                        <span
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                          style={{ background: '#F5F5F5', color: '#737373', border: '1px solid #D4D4D4' }}
                        >
                          {step.stepType}
                        </span>
                      )}
                      {step.stepIntent && (
                        <span
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                          style={{ background: '#F5F5F5', color: '#737373', border: '1px solid #D4D4D4' }}
                        >
                          {step.stepIntent}
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-[#A3A3A3] ml-auto">
                        View rewrite →
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="font-sans text-[15px] text-[#737373] mb-6">No flagged steps found.</p>
          )}
        </>
      )}
    </div>
  )
}
