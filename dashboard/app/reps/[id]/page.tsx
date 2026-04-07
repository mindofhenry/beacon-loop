'use client'

import { use, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useRewriteDrawer } from '@/context/RewriteDrawerContext'

// ─── Types ───────────────────────────────────────────────────────────────────

type RepRow = {
  id: number
  name: string
  email: string
  role: string
  team: string
  source_user_id: string
}

type StepPerfRow = {
  id: string
  sequence_id: string
  sequence_name: string | null
  step_id: string
  step_number: number
  step_type: string | null
  step_intent: string | null
  reply_rate: number | null
  open_rate: number | null
  send_volume: number
  flag_type: string
  flag_confidence: number | null
  messaging_theme: string | null
  rep_id: number | null
}

type AttrCreditRow = {
  step_id: string
  opportunity_id: string
}

type SequenceAgg = {
  sequence_id: string
  sequence_name: string
  source: 'Outreach' | 'Salesloft'
  step_count: number
  flagged_count: number
  avg_reply_rate: number | null
  pipeline_influenced: number
  health: number
}

type FlaggedStep = StepPerfRow & { severity: 'high' | 'medium' | 'low' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function healthColor(score: number): string {
  if (score >= 70) return '#16A34A'
  if (score >= 40) return '#F59E0B'
  return '#DC2626'
}

function severityColor(confidence: number | null): string {
  if (confidence == null) return '#737373'
  if (confidence >= 0.8) return '#DC2626'
  if (confidence >= 0.5) return '#F59E0B'
  return '#737373'
}

function severityLabel(confidence: number | null): 'high' | 'medium' | 'low' {
  if (confidence == null) return 'low'
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

function seqSource(sequenceId: string): 'Outreach' | 'Salesloft' {
  return sequenceId.startsWith('sl_') ? 'Salesloft' : 'Outreach'
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SourcePill({ source }: { source: 'Outreach' | 'Salesloft' | 'Mixed' }) {
  if (source === 'Mixed') {
    return (
      <span className="font-mono text-[13px] px-2 py-0.5 rounded"
        style={{ background: '#F5F5F5', color: '#737373', border: '1px solid #D4D4D4' }}>
        OR/SL
      </span>
    )
  }
  const isOR = source === 'Outreach'
  return (
    <span className="font-mono text-[13px] px-2 py-0.5 rounded"
      style={isOR
        ? { background: '#DBEAFE', color: '#2563EB', border: '1px solid #2563EB' }
        : { background: '#F5F5F5', color: '#737373', border: '1px solid #D4D4D4' }
      }>
      {isOR ? 'OR' : 'SL'}
    </span>
  )
}

function HealthBar({ score }: { score: number }) {
  const color = healthColor(score)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
      <div style={{ width: '72px', height: '4px', background: '#E5E5E5', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 300ms ease' }} />
      </div>
      <span className="font-mono text-[13px]" style={{ color, minWidth: '28px', textAlign: 'right' }}>
        {score}
      </span>
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '16px 20px',
      background: '#FFFFFF',
      border: '2px solid #1A1A1A',
      borderRadius: '8px',
      flex: '1 1 0',
      minWidth: '140px',
      boxShadow: '4px 4px 0px #1A1A1A',
    }}>
      <div className="font-mono text-[11px] uppercase text-[#A3A3A3]"
        style={{ letterSpacing: '0.08em', marginBottom: '6px' }}>
        {label}
      </div>
      <div className="font-mono text-[29px] font-semibold" style={{ color: color ?? '#1A1A1A' }}>
        {value}
      </div>
    </div>
  )
}

function SeverityDot({ confidence }: { confidence: number | null }) {
  return (
    <span style={{
      display: 'inline-block', width: '8px', height: '8px',
      borderRadius: '50%', background: severityColor(confidence), flexShrink: 0,
    }} />
  )
}

function TypeIntentPill({ children }: { children: string }) {
  return (
    <span className="font-mono text-[13px] px-2 py-0.5 rounded"
      style={{ background: '#F5F5F5', color: '#737373', border: '1px solid #D4D4D4' }}>
      {children}
    </span>
  )
}

function FlagPill({ type }: { type: string }) {
  return (
    <span className="font-mono text-[13px] px-2 py-0.5 rounded"
      style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #DC2626' }}>
      {type}
    </span>
  )
}

function FlaggedStepCard({ step, onClick }: { step: FlaggedStep; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer transition-colors duration-150 hover:bg-[#F5F5F5]"
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', borderBottom: '1px solid #E5E5E5',
      }}
    >
      <SeverityDot confidence={step.flag_confidence} />

      <span className="font-sans text-[17px] text-[#525252]" style={{ flex: '1 1 auto', minWidth: 0 }}>
        {step.sequence_name ?? step.sequence_id}
        <span className="text-[#737373]"> — Step {step.step_number}</span>
      </span>

      <span style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        {step.step_type && <TypeIntentPill>{step.step_type}</TypeIntentPill>}
        {step.step_intent && <TypeIntentPill>{step.step_intent}</TypeIntentPill>}
      </span>

      <span className="font-mono text-[17px]"
        style={{ color: '#DC2626', flexShrink: 0, minWidth: '52px', textAlign: 'right' }}>
        {fmt(step.reply_rate)}
      </span>

      <FlagPill type={step.flag_type} />
    </div>
  )
}

// ─── Pipeline Chart ──────────────────────────────────────────────────────────

const BAR_COLORS = ['#2563EB', '#4F46E5', '#7C3AED', '#9333EA', '#C026D3', '#DB2777', '#DC2626', '#EA580C']

function PipelineChart({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="font-sans text-[17px] text-[#737373] py-4 text-center">
        No pipeline attribution data for this rep.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 40 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <XAxis type="number" tick={{ fill: '#737373', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={160}
          tick={{ fill: '#525252', fontSize: 13, fontFamily: 'sans-serif' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#FFFFFF', border: '2px solid #1A1A1A', borderRadius: '6px', color: '#1A1A1A', fontSize: '13px' }}
          labelStyle={{ color: '#737373' }}
          formatter={(value) => [`${value} opps`, 'Pipeline']}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RepDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const repId = parseInt(id, 10)
  const router = useRouter()
  const { openDrawer } = useRewriteDrawer()

  const [rep, setRep] = useState<RepRow | null>(null)
  const [perfRows, setPerfRows] = useState<StepPerfRow[]>([])
  const [attrCredits, setAttrCredits] = useState<AttrCreditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (isNaN(repId)) {
      setNotFound(true)
      setLoading(false)
      return
    }

    async function load() {
      const [repResult, perfResult, attrResult] = await Promise.all([
        supabase.from('reps').select('*').eq('id', repId).single(),
        supabase.from('step_performance')
          .select('id, sequence_id, sequence_name, step_id, step_number, step_type, step_intent, reply_rate, open_rate, send_volume, flag_type, flag_confidence, messaging_theme, rep_id')
          .eq('rep_id', repId),
        supabase.from('step_attribution_credit').select('step_id, opportunity_id'),
      ])

      if (repResult.error) {
        if (repResult.error.code === 'PGRST116') {
          setNotFound(true)
        } else {
          setError(repResult.error.message)
        }
        setLoading(false)
        return
      }
      if (perfResult.error) { setError(perfResult.error.message); setLoading(false); return }
      if (attrResult.error) { setError(attrResult.error.message); setLoading(false); return }

      setRep(repResult.data as RepRow)

      // Deduplicate step_performance by step_id
      const seenStepIds = new Set<string>()
      const deduped = ((perfResult.data ?? []) as StepPerfRow[]).filter((r) => {
        if (seenStepIds.has(r.step_id)) return false
        seenStepIds.add(r.step_id)
        return true
      })
      setPerfRows(deduped)
      setAttrCredits((attrResult.data ?? []) as AttrCreditRow[])
      setLoading(false)
    }
    load()
  }, [repId])

  // Aggregate KPIs
  const kpis = useMemo(() => {
    const replyRates = perfRows.filter((r) => r.reply_rate != null).map((r) => r.reply_rate!)
    const openRates = perfRows.filter((r) => r.open_rate != null).map((r) => r.open_rate!)
    const flaggedCount = perfRows.filter((r) => r.flag_type !== 'none').length

    const avgReply = replyRates.length > 0 ? replyRates.reduce((a, b) => a + b, 0) / replyRates.length : null
    const avgOpen = openRates.length > 0 ? openRates.reduce((a, b) => a + b, 0) / openRates.length : null

    // Pipeline: count distinct opps via attribution credits
    const perfIds = new Set(perfRows.map((r) => r.id))
    const opps = new Set<string>()
    for (const credit of attrCredits) {
      if (perfIds.has(credit.step_id)) opps.add(credit.opportunity_id)
    }

    return { avgReply, avgOpen, flaggedCount, pipeline: opps.size }
  }, [perfRows, attrCredits])

  // Sequence portfolio
  const sequences = useMemo((): SequenceAgg[] => {
    const perfIds = new Set(perfRows.map((r) => r.id))
    // Count opps per sequence
    const seqOpps = new Map<string, Set<string>>()
    for (const credit of attrCredits) {
      if (!perfIds.has(credit.step_id)) continue
      const perf = perfRows.find((r) => r.id === credit.step_id)
      if (!perf) continue
      if (!seqOpps.has(perf.sequence_id)) seqOpps.set(perf.sequence_id, new Set())
      seqOpps.get(perf.sequence_id)!.add(credit.opportunity_id)
    }

    type Acc = {
      sequence_id: string
      sequence_name: string
      source: 'Outreach' | 'Salesloft'
      step_count: number
      flagged_count: number
      reply_rates: number[]
    }
    const seqMap = new Map<string, Acc>()

    for (const row of perfRows) {
      if (!seqMap.has(row.sequence_id)) {
        seqMap.set(row.sequence_id, {
          sequence_id: row.sequence_id,
          sequence_name: row.sequence_name ?? row.sequence_id,
          source: seqSource(row.sequence_id),
          step_count: 0,
          flagged_count: 0,
          reply_rates: [],
        })
      }
      const acc = seqMap.get(row.sequence_id)!
      acc.step_count++
      if (row.flag_type !== 'none') acc.flagged_count++
      if (row.reply_rate != null) acc.reply_rates.push(row.reply_rate)
    }

    return Array.from(seqMap.values()).map((acc) => ({
      sequence_id: acc.sequence_id,
      sequence_name: acc.sequence_name,
      source: acc.source,
      step_count: acc.step_count,
      flagged_count: acc.flagged_count,
      avg_reply_rate: acc.reply_rates.length > 0
        ? acc.reply_rates.reduce((a, b) => a + b, 0) / acc.reply_rates.length
        : null,
      pipeline_influenced: seqOpps.get(acc.sequence_id)?.size ?? 0,
      health: Math.max(0, 100 - acc.flagged_count * 15),
    }))
  }, [perfRows, attrCredits])

  // Flagged steps sorted by severity
  const flaggedSteps = useMemo((): FlaggedStep[] => {
    return perfRows
      .filter((r) => r.flag_type !== 'none')
      .map((r) => ({ ...r, severity: severityLabel(r.flag_confidence) }))
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 }
        return order[a.severity] - order[b.severity]
      })
  }, [perfRows])

  // Pipeline breakdown chart data
  const pipelineChartData = useMemo(() => {
    return sequences
      .filter((s) => s.pipeline_influenced > 0)
      .sort((a, b) => b.pipeline_influenced - a.pipeline_influenced)
      .map((s) => ({ name: s.sequence_name, value: s.pipeline_influenced }))
  }, [sequences])

  // Determine overall source for this rep
  const repSource = useMemo((): 'Outreach' | 'Salesloft' | 'Mixed' => {
    const sources = new Set(perfRows.map((r) => seqSource(r.sequence_id)))
    if (sources.size === 0) return 'Outreach'
    if (sources.size === 1) return sources.values().next().value as 'Outreach' | 'Salesloft'
    return 'Mixed'
  }, [perfRows])

  // Not found state
  if (notFound) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <button onClick={() => router.push('/reps')}
          className="inline-flex items-center gap-1.5 font-mono text-[13px] text-[#A3A3A3] hover:text-[#525252] transition-colors duration-150 cursor-pointer mb-6">
          <ChevronLeft size={14} /> All Reps
        </button>
        <p className="font-sans text-[17px] text-[#737373] py-8 text-center">
          Rep not found.
        </p>
      </div>
    )
  }

  const thStyle = "font-mono text-[9px] uppercase text-[#A3A3A3]"
  const thLetterSpacing = { letterSpacing: '0.08em' } as const

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Back link */}
      <button onClick={() => router.push('/reps')}
        className="inline-flex items-center gap-1.5 font-mono text-[13px] text-[#A3A3A3] hover:text-[#525252] transition-colors duration-150 cursor-pointer mb-6">
        <ChevronLeft size={14} /> All Reps
      </button>

      {error && <p className="font-sans text-[17px] text-red-400">Error: {error}</p>}

      {loading && (
        <div className="space-y-2">
          {['w-full', 'w-11/12', 'w-full', 'w-10/12', 'w-full'].map((w, i) => (
            <div key={i} className={`h-12 bg-[#E5E5E5] rounded animate-pulse ${w}`} />
          ))}
        </div>
      )}

      {!loading && !error && rep && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          {/* ── Rep Header ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <h1 className="font-sans text-[24px] font-semibold text-[#1A1A1A]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {rep.name}
              </h1>
              <SourcePill source={repSource} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <span className="font-mono text-[13px] text-[#737373]">{rep.team}</span>
              <span className="font-mono text-[13px] text-[#A3A3A3]">|</span>
              <span className="font-mono text-[13px] text-[#737373]">{rep.role.toUpperCase()}</span>
            </div>

            {/* KPI cards */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <KpiCard label="Reply Rate" value={fmt(kpis.avgReply)} />
              <KpiCard label="Open Rate" value={fmt(kpis.avgOpen)} />
              <KpiCard label="Pipeline" value={String(kpis.pipeline)} />
              <KpiCard
                label="Flagged Steps"
                value={String(kpis.flaggedCount)}
                color={kpis.flaggedCount > 0 ? '#DC2626' : '#1A1A1A'}
              />
            </div>
          </div>

          {/* ── Sequence Portfolio ── */}
          <div>
            <h2 className="font-sans text-[19px] font-semibold text-[#1A1A1A] mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Sequence Portfolio
            </h2>
            {sequences.length === 0 ? (
              <p className="font-sans text-[17px] text-[#737373] py-4 text-center">
                No sequences assigned to this rep.
              </p>
            ) : (
              <div className="border-2 border-[#1A1A1A] rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#F5F5F5] border-b-2 border-[#1A1A1A] sticky top-0">
                      <th className="text-left px-4 py-3">
                        <span className={thStyle} style={thLetterSpacing}>Sequence</span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className={thStyle} style={thLetterSpacing}>Health</span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className={thStyle} style={thLetterSpacing}>Reply Rate</span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className={thStyle} style={thLetterSpacing}>Flagged</span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className={thStyle} style={thLetterSpacing}>Pipeline</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sequences.map((seq) => (
                      <tr key={seq.sequence_id}
                        onClick={() => router.push(`/sequences/${seq.sequence_id}`)}
                        className="border-b border-b-[#E5E5E5] cursor-pointer transition-colors duration-150 hover:bg-[#F5F5F5]">
                        <td className="px-4 py-3.5">
                          <div className="font-sans text-[17px] text-[#525252]">{seq.sequence_name}</div>
                          <div className="font-mono text-[11px] text-[#A3A3A3] mt-0.5" style={{ letterSpacing: '0.04em' }}>
                            {seq.sequence_id}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <HealthBar score={seq.health} />
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="font-mono text-[17px] text-[#525252]">{fmt(seq.avg_reply_rate)}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="font-mono text-[17px]"
                            style={{ color: seq.flagged_count > 0 ? '#DC2626' : '#737373' }}>
                            {seq.flagged_count}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="font-mono text-[17px] text-[#525252]">{seq.pipeline_influenced}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Flagged Steps ── */}
          <div>
            <h2 className="font-sans text-[19px] font-semibold text-[#1A1A1A] mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Flagged Steps
              {flaggedSteps.length > 0 && (
                <span className="font-mono text-[13px] text-[#DC2626] ml-3">
                  {flaggedSteps.length}
                </span>
              )}
            </h2>
            {flaggedSteps.length === 0 ? (
              <p className="font-sans text-[17px] text-[#737373] py-4 text-center">
                No flagged steps for this rep.
              </p>
            ) : (
              <div className="border-2 border-[#1A1A1A] rounded-lg overflow-hidden">
                {flaggedSteps.map((step) => (
                  <FlaggedStepCard key={step.step_id} step={step} onClick={() => openDrawer(step.step_id)} />
                ))}
              </div>
            )}
          </div>

          {/* ── Pipeline Breakdown ── */}
          <div>
            <h2 className="font-sans text-[19px] font-semibold text-[#1A1A1A] mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Pipeline Breakdown
            </h2>
            <div className="border-2 border-[#1A1A1A] rounded-lg overflow-hidden"
              style={{ padding: '16px', background: '#FFFFFF' }}>
              <PipelineChart data={pipelineChartData} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
