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
  green:  { bg: '#052010', color: '#4ade80', border: '#0d3d1c' },
  yellow: { bg: '#1a1200', color: '#fbbf24', border: '#332400' },
  red:    { bg: '#1a0505', color: '#f87171', border: '#331010' },
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
        style={{ background: '#0a0a0a', borderLeft: '1px solid #1c1c1c' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
          style={{ background: '#0a0a0a', borderBottom: '1px solid #1c1c1c' }}
        >
          <div className="flex items-center gap-3">
            <span
              style={{
                fontFamily: 'IBM Plex Sans',
                fontSize: '13px',
                fontWeight: 400,
                color: '#aaa',
                letterSpacing: '0.04em',
              }}
            >
              {detail?.sequence_name ?? sequenceId}
            </span>
            {detail?.source && (
              <span
                style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '9px',
                  background: '#141414',
                  color: '#555',
                  border: '1px solid #222',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                {detail.source}
              </span>
            )}
            <span
              style={{
                fontFamily: 'IBM Plex Mono',
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '4px',
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
            style={{ color: '#333' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#333')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Sequence Intelligence */}
          <div
            style={{
              background: '#0f0f0f',
              border: '1px solid #1c1c1c',
              borderRadius: '6px',
              padding: '16px',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '9px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#333',
                }}
              >
                Sequence Intelligence
              </span>
              <button
                onClick={() => fetchSummary(true)}
                disabled={loadingSummary}
                className="flex items-center gap-1.5 transition-colors duration-150 cursor-pointer"
                style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: '#555' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
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
                <div className="h-3 bg-[#1c1c1c] rounded animate-pulse w-full" />
                <div className="h-3 bg-[#1c1c1c] rounded animate-pulse w-3/4" />
              </div>
            ) : (
              <p
                style={{
                  fontFamily: 'IBM Plex Sans',
                  fontSize: '12px',
                  color: '#888',
                  lineHeight: 1.6,
                }}
              >
                {summary?.summary_text ?? 'No summary available.'}
              </p>
            )}
          </div>

          {/* Reply Rate by Step chart */}
          {loadingDetail ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-[#1c1c1c] rounded-lg animate-pulse" />
              ))}
            </div>
          ) : chartData.length > 0 ? (
            <div>
              <p
                style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '9px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#333',
                  marginBottom: '12px',
                }}
              >
                Reply Rate by Step
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#555', fontSize: 11, fontFamily: 'IBM Plex Sans' }}
                    axisLine={{ stroke: '#1c1c1c' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#555', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                    axisLine={{ stroke: '#1c1c1c' }}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f0f0f',
                      border: '1px solid #1c1c1c',
                      borderRadius: '6px',
                      fontFamily: 'IBM Plex Sans',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#aaa', fontFamily: 'IBM Plex Mono' }}
                    itemStyle={{ color: '#555' }}
                    formatter={(value, _name, props) => {
                      const p = props?.payload as { severity?: string; stepType?: string } | undefined
                      return [`${value}% (${p?.severity ?? ''})`, p?.stepType ?? '']
                    }}
                  />
                  <ReferenceLine
                    y={3.5}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    label={{ value: 'Flag threshold', fill: '#F59E0B', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
                  />
                  <Bar dataKey="replyRate" radius={[4, 4, 0, 0]} isAnimationActive={true}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.severity === 'FLAGGED' ? '#f87171' : '#4ade80'}
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
                style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '9px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#333',
                  marginBottom: '8px',
                }}
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
                      background: flagged ? '#0d0606' : 'transparent',
                      borderLeft: flagged ? '2px solid #f87171' : '2px solid #1c1c1c',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            fontFamily: 'IBM Plex Mono',
                            fontSize: '9px',
                            color: '#333',
                            background: '#141414',
                            padding: '2px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          {step.step_number}
                        </span>
                        <span style={{ color: '#555' }}>
                          <StepIcon type={step.step_type} />
                        </span>
                        <span
                          style={{
                            fontFamily: 'IBM Plex Sans',
                            fontSize: '11px',
                            color: '#888',
                          }}
                        >
                          {step.step_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {step.step_intent && (
                          <span
                            style={{
                              fontFamily: 'IBM Plex Mono',
                              fontSize: '9px',
                              background: '#141414',
                              color: '#555',
                              border: '1px solid #222',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {step.step_intent}
                          </span>
                        )}
                        {flagged ? (
                          <span
                            style={{
                              fontFamily: 'IBM Plex Mono',
                              fontSize: '10px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: '#1a0505',
                              color: '#f87171',
                              border: '1px solid #331010',
                            }}
                          >
                            FLAGGED
                          </span>
                        ) : (
                          <span
                            style={{
                              fontFamily: 'IBM Plex Mono',
                              fontSize: '10px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: '#141414',
                              color: '#555',
                              border: '1px solid #222',
                            }}
                          >
                            OK
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        style={{
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '18px',
                          color: '#e5e5e5',
                        }}
                      >
                        {fmt(step.reply_rate)}
                      </span>
                      <span
                        style={{
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '11px',
                          color: '#555',
                        }}
                      >
                        open {fmt(step.open_rate)}
                      </span>
                      <span
                        style={{
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '11px',
                          color: '#555',
                        }}
                      >
                        mtg {fmt(step.meeting_rate)}
                      </span>
                      <span
                        style={{
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '11px',
                          color: '#555',
                        }}
                      >
                        {step.send_volume} sends
                      </span>
                      {flagged && (
                        <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <ChevronRight size={14} style={{ color: '#555' }} />
                        </span>
                      )}
                    </div>
                    {step.subject && (
                      <p
                        className="truncate"
                        style={{
                          fontFamily: 'IBM Plex Sans',
                          fontSize: '11px',
                          color: '#444',
                          fontStyle: 'italic',
                          marginTop: '4px',
                        }}
                      >
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
