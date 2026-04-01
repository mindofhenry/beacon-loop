'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, RefreshCw, Loader2, Mail, Phone, Globe } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import RewriteModal from './RewriteModal'

type StepData = {
  step_id: string
  step_number: number
  step_type: string
  step_intent: string | null
  subject: string | null
  send_volume: number
  open_rate: number
  reply_rate: number
  meeting_rate: number
  pipeline_value: number
  health_score_v2: number
  flag_type: string
  flag_confidence: number | null
  severity: 'FLAGGED' | 'OK'
}

type SequenceDetail = {
  sequence_id: string
  sequence_name: string
  source: string
  steps: StepData[]
}

type SummaryData = {
  summary_text: string
  generated_at: string
}

type Props = {
  sequenceId: string
  healthScore: number
  tier: 'green' | 'yellow' | 'red'
  personaConfigId: string
  onClose: () => void
}

const tierColors = {
  green: 'bg-[#22c55e]',
  yellow: 'bg-[#F59E0B]',
  red: 'bg-[#ef4444]',
}

const severityColors = {
  FLAGGED: { bg: 'bg-[#F59E0B]/10', border: 'border-l-[#F59E0B]', badge: 'bg-[#F59E0B]' },
  OK: { bg: 'bg-slate-800/30', border: 'border-l-slate-600', badge: 'bg-slate-600' },
}

function StepIcon({ type }: { type: string }) {
  const t = type.toLowerCase()
  if (t.includes('call') || t.includes('phone')) return <Phone size={14} />
  if (t.includes('linkedin')) return <Globe size={14} />
  return <Mail size={14} />
}

function fmt(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export default function SequenceSlideOut({
  sequenceId,
  healthScore,
  tier,
  personaConfigId,
  onClose,
}: Props) {
  const [detail, setDetail] = useState<SequenceDetail | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [rewriteStepId, setRewriteStepId] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    setLoadingDetail(true)
    const res = await fetch(`/api/sequences/${sequenceId}`)
    const json = await res.json()
    setDetail(json.data ?? null)
    setLoadingDetail(false)
  }, [sequenceId])

  const fetchSummary = useCallback(
    async (force = false) => {
      setLoadingSummary(true)
      const url = `/api/sequences/${sequenceId}/summary${force ? '?force=true' : ''}`
      const res = await fetch(url)
      const json = await res.json()
      setSummary(json.data ?? null)
      setLoadingSummary(false)
    },
    [sequenceId]
  )

  useEffect(() => {
    fetchDetail()
    fetchSummary()
  }, [fetchDetail, fetchSummary])

  // Chart data
  const chartData = (detail?.steps ?? []).map((s) => ({
    name: `Step ${s.step_number}`,
    replyRate: Number((s.reply_rate * 100).toFixed(2)),
    severity: s.severity,
    stepType: s.step_type,
  }))

  // Find the step being rewritten (for the modal)
  const rewriteStep = detail?.steps.find((s) => s.step_id === rewriteStepId)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full md:w-[50vw] bg-[#0f0f0f] border-l border-[#1f1f1f] overflow-y-auto transform transition-transform duration-200 ease-out translate-x-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0f0f0f] border-b border-[#1f1f1f] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-lg text-slate-100">
              {detail?.sequence_name ?? sequenceId}
            </h2>
            {detail?.source && (
              <span className="font-sans text-xs bg-[#1E40AF] text-white px-2.5 py-0.5 rounded-full">
                {detail.source}
              </span>
            )}
            <span
              className={`font-mono text-xs text-white px-2.5 py-0.5 rounded-full ${tierColors[tier]}`}
            >
              {(healthScore * 100).toFixed(0)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition-colors duration-150 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Claude sequence summary */}
          <div className="bg-[#0f1a2e] border-l-3 border-[#1E40AF] rounded-r-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-sans text-xs text-[#3B82F6]">
                Sequence Intelligence
              </span>
              <button
                onClick={() => fetchSummary(true)}
                disabled={loadingSummary}
                className="flex items-center gap-1.5 text-[#F59E0B] font-sans text-xs hover:opacity-80 transition-opacity duration-150 cursor-pointer"
              >
                {loadingSummary ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                Refresh
              </button>
            </div>
            {loadingSummary ? (
              <div className="space-y-2">
                <div className="h-3 bg-slate-700/50 rounded animate-pulse w-full" />
                <div className="h-3 bg-slate-700/50 rounded animate-pulse w-3/4" />
              </div>
            ) : (
              <p className="font-sans text-sm text-slate-200 leading-relaxed">
                {summary?.summary_text ?? 'No summary available.'}
              </p>
            )}
          </div>

          {/* Step waterfall chart */}
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm font-sans py-8 justify-center">
              <Loader2 size={16} className="animate-spin" />
              Loading steps...
            </div>
          ) : chartData.length > 0 ? (
            <div>
              <h3 className="font-sans text-xs text-slate-400 mb-3">
                Reply Rate by Step
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Fira Sans' }}
                    axisLine={{ stroke: '#1f1f1f' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Fira Code' }}
                    axisLine={{ stroke: '#1f1f1f' }}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111111',
                      border: '1px solid #1f1f1f',
                      borderRadius: '8px',
                      fontFamily: 'Fira Sans',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#f1f5f9', fontFamily: 'Fira Code' }}
                    itemStyle={{ color: '#94a3b8' }}
                    formatter={(value, _name, props) => {
                      const p = props?.payload as { severity?: string; stepType?: string } | undefined
                      return [`${value}% (${p?.severity ?? ''})`, p?.stepType ?? '']
                    }}
                  />
                  <ReferenceLine
                    y={3.5}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    label={{ value: 'Flag threshold', fill: '#F59E0B', fontSize: 10, fontFamily: 'Fira Sans' }}
                  />
                  <Bar
                    dataKey="replyRate"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={true}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.severity === 'FLAGGED' ? '#F59E0B' : '#22c55e'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {/* Step cards */}
          {detail?.steps && (
            <div className="space-y-2">
              <h3 className="font-sans text-xs text-slate-400 mb-2">Steps</h3>
              {detail.steps.map((step) => {
                const sc = severityColors[step.severity]
                const clickable = step.severity === 'FLAGGED'
                return (
                  <div
                    key={step.step_id}
                    onClick={clickable ? () => setRewriteStepId(step.step_id) : undefined}
                    className={`${sc.bg} border-l-2 ${sc.border} rounded-r-lg p-4 transition-all duration-150 ${
                      clickable
                        ? 'cursor-pointer hover:bg-opacity-20'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400 bg-[#1f1f1f] px-2 py-0.5 rounded">
                          {step.step_number}
                        </span>
                        <span className="text-slate-400">
                          <StepIcon type={step.step_type} />
                        </span>
                        <span className="font-sans text-xs text-slate-400">
                          {step.step_type}
                        </span>
                      </div>
                      <span
                        className={`font-mono text-[10px] text-white px-2 py-0.5 rounded-full ${sc.badge}`}
                      >
                        {step.severity}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-4">
                      <span className="font-mono text-lg text-slate-100">
                        {fmt(step.reply_rate)}
                      </span>
                      <span className="font-mono text-xs text-slate-400">
                        open {fmt(step.open_rate)}
                      </span>
                      <span className="font-mono text-xs text-slate-400">
                        mtg {fmt(step.meeting_rate)}
                      </span>
                    </div>
                    {step.subject && (
                      <p className="font-sans text-xs text-slate-500 mt-1 truncate">
                        {step.subject}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rewrite modal */}
      {rewriteStepId && rewriteStep && (
        <RewriteModal
          stepId={rewriteStepId}
          stepNumber={rewriteStep.step_number}
          stepType={rewriteStep.step_type}
          sequenceName={detail?.sequence_name ?? sequenceId}
          currentSubject={rewriteStep.subject}
          currentBody={null}
          personaConfigId={personaConfigId}
          onClose={() => setRewriteStepId(null)}
        />
      )}
    </>
  )
}
