'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, RefreshCw, Loader2, Mail, Phone, Globe, ChevronRight } from 'lucide-react'
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
  body_text: string | null
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

const tierPill: Record<'green' | 'yellow' | 'red', { bg: string; color: string; border: string }> = {
  green:  { bg: '#DCFCE7', color: '#16A34A', border: '#16A34A' },
  yellow: { bg: '#FEF3C7', color: '#F59E0B', border: '#F59E0B' },
  red:    { bg: '#FEE2E2', color: '#DC2626', border: '#DC2626' },
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

  const chartData = (detail?.steps ?? []).map((s) => ({
    name: `Step ${s.step_number}`,
    replyRate: Number((s.reply_rate * 100).toFixed(2)),
    severity: s.severity,
    stepType: s.step_type,
  }))

  const rewriteStep = detail?.steps.find((s) => s.step_id === rewriteStepId)
  const pill = tierPill[tier]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Slide-out panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full w-full md:w-[50vw] overflow-y-auto transform transition-transform duration-200 ease-out translate-x-0"
        style={{ background: '#FFFFFF', borderLeft: '2px solid #1A1A1A' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
          style={{ background: '#FFFFFF', borderBottom: '2px solid #1A1A1A' }}
        >
          <div className="flex items-center gap-3">
            <span className="font-sans text-[17px] text-[#525252]" style={{ letterSpacing: '0.04em' }}>
              {detail?.sequence_name ?? sequenceId}
            </span>
            {detail?.source && (
              <span
                className="font-mono text-[11px] rounded px-1.5 py-0.5"
                style={{
                  background: '#F5F5F5',
                  color: '#737373',
                  border: '1px solid #D4D4D4',
                }}
              >
                {detail.source}
              </span>
            )}
            <span
              className="font-mono text-[13px] rounded px-2 py-0.5"
              style={{
                background: pill.bg,
                color: pill.color,
                border: `1px solid ${pill.border}`,
              }}
            >
              {(healthScore * 100).toFixed(0)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="transition-colors duration-150 cursor-pointer"
            style={{ color: '#A3A3A3' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#525252')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#A3A3A3')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Sequence Intelligence */}
          <div
            className="rounded-md p-4"
            style={{
              background: '#F5F5F5',
              border: '2px solid #D4D4D4',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="font-mono text-[11px] uppercase text-[#A3A3A3]"
                style={{ letterSpacing: '0.08em' }}
              >
                Sequence Intelligence
              </span>
              <button
                onClick={() => fetchSummary(true)}
                disabled={loadingSummary}
                className="flex items-center gap-1.5 transition-colors duration-150 cursor-pointer font-mono text-[13px]"
                style={{ color: '#525252' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#1A1A1A')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#525252')}
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
                <div className="h-3 bg-[#E5E5E5] rounded animate-pulse w-full" />
                <div className="h-3 bg-[#E5E5E5] rounded animate-pulse w-3/4" />
              </div>
            ) : (
              <p className="font-sans text-[17px] text-[#525252] leading-relaxed">
                {summary?.summary_text ?? 'No summary available.'}
              </p>
            )}
          </div>

          {/* Reply Rate by Step chart */}
          {loadingDetail ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-[#E5E5E5] rounded-lg animate-pulse" />
              ))}
            </div>
          ) : chartData.length > 0 ? (
            <div>
              <p
                className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-3"
                style={{ letterSpacing: '0.08em' }}
              >
                Reply Rate by Step
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#737373', fontSize: 13, fontFamily: "'Satoshi', sans-serif" }}
                    axisLine={{ stroke: '#E5E5E5' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#737373', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}
                    axisLine={{ stroke: '#E5E5E5' }}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #1A1A1A',
                      borderRadius: '6px',
                      fontFamily: "'Satoshi', sans-serif",
                      fontSize: '15px',
                    }}
                    labelStyle={{ color: '#737373', fontFamily: "'JetBrains Mono', monospace" }}
                    itemStyle={{ color: '#737373' }}
                    formatter={(value, _name, props) => {
                      const p = props?.payload as { severity?: string; stepType?: string } | undefined
                      return [`${value}% (${p?.severity ?? ''})`, p?.stepType ?? '']
                    }}
                  />
                  <ReferenceLine
                    y={3.5}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    label={{ value: 'Flag threshold', fill: '#F59E0B', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <Bar dataKey="replyRate" radius={[4, 4, 0, 0]} isAnimationActive={true}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.severity === 'FLAGGED' ? '#DC2626' : '#16A34A'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {/* Step cards */}
          {!loadingDetail && detail?.steps && (
            <div className="space-y-2">
              <p
                className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-2"
                style={{ letterSpacing: '0.08em' }}
              >
                Steps
              </p>
              {detail.steps.map((step) => {
                const flagged = step.severity === 'FLAGGED'
                return (
                  <div
                    key={step.step_id}
                    onClick={flagged ? () => setRewriteStepId(step.step_id) : undefined}
                    className={`group p-4 transition-all duration-150 ${flagged ? 'cursor-pointer' : ''}`}
                    style={{
                      background: flagged ? '#FEE2E2' : 'transparent',
                      borderLeft: flagged ? '2px solid #DC2626' : '2px solid #E5E5E5',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-[11px] rounded px-1.5 py-0.5"
                          style={{
                            color: '#A3A3A3',
                            background: '#F5F5F5',
                          }}
                        >
                          {step.step_number}
                        </span>
                        <span style={{ color: '#737373' }}>
                          <StepIcon type={step.step_type} />
                        </span>
                        <span className="font-sans text-[15px] text-[#525252]">
                          {step.step_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {step.step_intent && (
                          <span
                            className="font-mono text-[11px] rounded px-1.5 py-0.5"
                            style={{
                              background: '#F5F5F5',
                              color: '#737373',
                              border: '1px solid #D4D4D4',
                            }}
                          >
                            {step.step_intent}
                          </span>
                        )}
                        {flagged ? (
                          <span
                            className="font-mono text-[13px] rounded px-2 py-0.5"
                            style={{
                              background: '#FEE2E2',
                              color: '#DC2626',
                              border: '1px solid #DC2626',
                            }}
                          >
                            FLAGGED
                          </span>
                        ) : (
                          <span
                            className="font-mono text-[13px] rounded px-2 py-0.5"
                            style={{
                              background: '#F5F5F5',
                              color: '#737373',
                              border: '1px solid #D4D4D4',
                            }}
                          >
                            OK
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-[22px] text-[#1A1A1A]">
                        {fmt(step.reply_rate)}
                      </span>
                      <span className="font-mono text-[13px] text-[#737373]">
                        open {fmt(step.open_rate)}
                      </span>
                      <span className="font-mono text-[13px] text-[#737373]">
                        mtg {fmt(step.meeting_rate)}
                      </span>
                      <span className="font-mono text-[13px] text-[#737373]">
                        {step.send_volume} sends
                      </span>
                      {flagged && (
                        <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <ChevronRight size={14} style={{ color: '#737373' }} />
                        </span>
                      )}
                    </div>
                    {step.subject && (
                      <p className="truncate font-sans text-[15px] italic text-[#737373] mt-1">
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
          currentBody={rewriteStep.body_text ?? null}
          healthScore={rewriteStep.health_score_v2}
          personaConfigId={personaConfigId}
          onClose={() => setRewriteStepId(null)}
        />
      )}
    </>
  )
}
