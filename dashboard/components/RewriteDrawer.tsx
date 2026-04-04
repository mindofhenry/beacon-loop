'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Copy, Check, RefreshCw, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRewriteDrawer } from '@/context/RewriteDrawerContext'

// ─── Types ──────────────────────────────────────────────────────────────────

type FailureMode = {
  code: string
  name: string
  rationale: string
  confidence: string
}

type StepCopySnapshot = {
  subject?: string
  body?: string
}

type RewriteRow = {
  id: string
  step_id: string
  sequence_id: string
  sequence_name: string | null
  step_number: number
  failure_modes_detected: FailureMode[] | null
  methodology_used: string | null
  signal_class: string | null
  confidence: string | null
  step_copy_snapshot: StepCopySnapshot | null
  suggested_subject: string | null
  suggested_body: string | null
  diagnosis: string | null
  explanation: string | null
  rewrite_directions: string[] | null
}

type StepPerfRow = {
  step_id: string
  sequence_id: string
  sequence_name: string | null
  step_number: number
  step_type: string | null
  step_intent: string | null
  flag_type: string
  flag_confidence: number | null
  reply_rate: number | null
  open_rate: number | null
  send_volume: number
  messaging_theme: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function severityFromConfidence(confidence: number | null): 'high' | 'medium' | 'low' {
  if (confidence == null) return 'low'
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

const severityStyles: Record<string, { bg: string; color: string; border: string }> = {
  high: { bg: '#1a0505', color: '#f87171', border: '#331010' },
  medium: { bg: '#1a1200', color: '#fbbf24', border: '#332400' },
  low: { bg: '#141414', color: '#555', border: '#222' },
}

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function fmDisplayName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function methodologyName(text: string): string {
  // Extract methodology name from the beginning (before the first " — " or period)
  const dashMatch = text.match(/^([^—–]+)[—–]/)
  if (dashMatch) return dashMatch[1].trim()
  const dotMatch = text.match(/^([^.]+)\./)
  if (dotMatch && dotMatch[1].length < 80) return dotMatch[1].trim()
  return text.slice(0, 60) + (text.length > 60 ? '...' : '')
}

function methodologyRationale(text: string): string {
  const dashIdx = text.search(/[—–]/)
  if (dashIdx > 0) return text.slice(dashIdx + 1).trim()
  const dotIdx = text.indexOf('.')
  if (dotIdx > 0 && dotIdx < 80) return text.slice(dotIdx + 1).trim()
  return ''
}

function buildTalkingPoints(
  perf: StepPerfRow | null,
  rewrite: RewriteRow | null
): string {
  if (!perf || !rewrite) return ''

  const stepLabel = `Step ${perf.step_number} of ${perf.sequence_name ?? perf.sequence_id}`
  const fmNames = (rewrite.failure_modes_detected ?? [])
    .map((fm) => fmDisplayName(fm.name))
    .join(' and ')
  const methName = rewrite.methodology_used
    ? methodologyName(rewrite.methodology_used)
    : 'targeted methodology'
  const directions = (rewrite.rewrite_directions ?? [])
    .map((d) => d.replace(/_/g, ' '))
    .join(', ')

  const line1 = `${stepLabel} was flagged for ${fmNames || 'underperformance'} with a ${fmt(perf.reply_rate)} reply rate.`
  const line2 = `The rewrite applies ${methName} to address the core issues.`
  const line3 = directions
    ? `Key changes: ${directions}.`
    : `The suggested copy restructures the message for higher engagement.`

  return `${line1} ${line2} ${line3}`
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RewriteDrawer() {
  const { isOpen, stepId, closeDrawer } = useRewriteDrawer()

  const [rewrite, setRewrite] = useState<RewriteRow | null>(null)
  const [perf, setPerf] = useState<StepPerfRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Fetch data when stepId changes
  const fetchData = useCallback(async (sid: string) => {
    setLoading(true)
    setRewrite(null)
    setPerf(null)

    const [rewriteResult, perfResult] = await Promise.all([
      supabase
        .from('rewrite_suggestions')
        .select('id, step_id, sequence_id, sequence_name, step_number, failure_modes_detected, methodology_used, signal_class, confidence, step_copy_snapshot, suggested_subject, suggested_body, diagnosis, explanation, rewrite_directions')
        .eq('step_id', sid)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('step_performance')
        .select('step_id, sequence_id, sequence_name, step_number, step_type, step_intent, flag_type, flag_confidence, reply_rate, open_rate, send_volume, messaging_theme')
        .eq('step_id', sid)
        .limit(1)
        .maybeSingle(),
    ])

    if (rewriteResult.data) setRewrite(rewriteResult.data as RewriteRow)
    if (perfResult.data) setPerf(perfResult.data as StepPerfRow)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (stepId) fetchData(stepId)
  }, [stepId, fetchData])

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, closeDrawer])

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Clipboard
  async function handleCopy() {
    const text = buildTalkingPoints(perf, rewrite)
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Generate / Regenerate
  async function handleGenerate() {
    if (!stepId || generating) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/rewrites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || `Request failed (${res.status})`)
      }
      const { data } = await res.json()
      // Map API response to RewriteRow — missing pipeline-only fields stay null
      setRewrite({
        id: data.id,
        step_id: data.step_id,
        sequence_id: data.sequence_id,
        sequence_name: data.sequence_name,
        step_number: data.step_number,
        failure_modes_detected: data.failure_modes_detected ?? null,
        methodology_used: data.methodology_used ?? null,
        signal_class: data.signal_class ?? null,
        confidence: data.confidence ?? null,
        step_copy_snapshot: data.step_copy_snapshot ?? null,
        suggested_subject: data.suggested_subject ?? null,
        suggested_body: data.suggested_body ?? null,
        diagnosis: data.diagnosis ?? null,
        explanation: data.explanation ?? null,
        rewrite_directions: data.rewrite_directions ?? null,
      })
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate rewrite.')
    } finally {
      setGenerating(false)
    }
  }

  // Derived
  const severity = perf ? severityFromConfidence(perf.flag_confidence) : 'low'
  const sevStyle = severityStyles[severity]
  const hasRewrite = rewrite !== null
  const talkingPoints = buildTalkingPoints(perf, rewrite)

  // Header data — prefer perf, fall back to rewrite
  const sequenceName = perf?.sequence_name ?? rewrite?.sequence_name ?? '—'
  const stepNumber = perf?.step_number ?? rewrite?.step_number ?? 0
  const stepType = perf?.step_type ?? null
  const stepIntent = perf?.step_intent ?? null

  if (!isOpen) return null

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-[70] transition-opacity duration-200"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={closeDrawer}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 z-[80] h-full overflow-y-auto"
        style={{
          width: '440px',
          maxWidth: '100vw',
          background: '#0a0a0a',
          borderLeft: '1px solid #1c1c1c',
          animation: 'slideInRight 250ms ease-out',
        }}
      >
        {/* ── Close button ── */}
        <button
          onClick={closeDrawer}
          className="absolute top-4 right-4 z-10 transition-colors duration-150 cursor-pointer"
          style={{ color: '#333' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#333')}
        >
          <X size={18} />
        </button>

        {loading ? (
          <div className="px-6 py-8 space-y-4">
            <div className="h-6 bg-[#1c1c1c] rounded animate-pulse w-3/4" />
            <div className="h-4 bg-[#1c1c1c] rounded animate-pulse w-1/2" />
            <div className="h-32 bg-[#1c1c1c] rounded-lg animate-pulse" />
            <div className="h-32 bg-[#1c1c1c] rounded-lg animate-pulse" />
          </div>
        ) : !perf && !rewrite ? (
          <div className="px-6 py-20 text-center">
            <p className="font-sans text-[17px] text-[#555]">No data found for this step.</p>
          </div>
        ) : (
          <div className="px-6 py-6 space-y-6">
            {/* ── Section 1: Header ── */}
            <div style={{ paddingRight: '28px' }}>
              <div className="font-sans text-[19px] text-[#e5e5e5] font-semibold mb-1">
                {sequenceName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="font-mono text-[15px] text-[#888]">
                  Step {stepNumber}
                </span>
                {stepType && (
                  <span
                    className="font-mono text-[13px] px-2 py-0.5 rounded"
                    style={{ background: '#141414', color: '#555', border: '1px solid #222' }}
                  >
                    {stepType}
                  </span>
                )}
                {stepIntent && (
                  <span
                    className="font-mono text-[13px] px-2 py-0.5 rounded"
                    style={{ background: '#141414', color: '#555', border: '1px solid #222' }}
                  >
                    {stepIntent}
                  </span>
                )}
                <span
                  className="font-mono text-[13px] px-2 py-0.5 rounded uppercase"
                  style={{ background: sevStyle.bg, color: sevStyle.color, border: `1px solid ${sevStyle.border}` }}
                >
                  {severity}
                </span>
              </div>
              {perf && (
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                  <div>
                    <span className="font-mono text-[11px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                      Reply Rate
                    </span>
                    <div className="font-mono text-[17px]" style={{ color: '#f87171' }}>
                      {fmt(perf.reply_rate)}
                    </div>
                  </div>
                  <div>
                    <span className="font-mono text-[11px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                      Open Rate
                    </span>
                    <div className="font-mono text-[17px] text-[#aaa]">{fmt(perf.open_rate)}</div>
                  </div>
                  <div>
                    <span className="font-mono text-[11px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                      Sends
                    </span>
                    <div className="font-mono text-[17px] text-[#aaa]">{perf.send_volume}</div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ height: '1px', background: '#1c1c1c' }} />

            {hasRewrite ? (
              <>
                {/* ── Section 2: Failure Mode Diagnosis ── */}
                <div>
                  <div
                    className="font-mono text-[11px] uppercase text-[#333] mb-3"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Failure Mode Diagnosis
                  </div>

                  {rewrite.signal_class && (
                    <div className="mb-3">
                      <span
                        className="font-mono text-[13px] px-2 py-0.5 rounded"
                        style={{ background: '#0d1526', color: '#3b82f6', border: '1px solid #1a2d4a' }}
                      >
                        {rewrite.signal_class.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}

                  {rewrite.failure_modes_detected && rewrite.failure_modes_detected.length > 0 ? (
                    <div className="space-y-3">
                      {rewrite.failure_modes_detected.map((fm, i) => (
                        <div
                          key={i}
                          className="rounded-md p-3"
                          style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span className="font-mono text-[15px] text-[#e5e5e5] font-medium">
                              {fm.code.toUpperCase()}
                            </span>
                            <span className="font-sans text-[15px] text-[#aaa]">
                              {fmDisplayName(fm.name)}
                            </span>
                            {fm.confidence && (
                              <span className="font-mono text-[11px] text-[#555]">
                                ({fm.confidence})
                              </span>
                            )}
                          </div>
                          <p className="font-sans text-[15px] text-[#888] leading-relaxed">
                            {fm.rationale}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-sans text-[15px] text-[#555]">No failure modes recorded.</p>
                  )}
                </div>

                <div style={{ height: '1px', background: '#1c1c1c' }} />

                {/* ── Section 3: Methodology ── */}
                <div>
                  <div
                    className="font-mono text-[11px] uppercase text-[#333] mb-3"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Methodology
                  </div>
                  {rewrite.methodology_used ? (
                    <>
                      <div className="font-sans text-[17px] text-[#e5e5e5] font-medium mb-2">
                        {methodologyName(rewrite.methodology_used)}
                      </div>
                      {methodologyRationale(rewrite.methodology_used) && (
                        <p className="font-sans text-[15px] text-[#888] leading-relaxed">
                          {methodologyRationale(rewrite.methodology_used)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="font-sans text-[15px] text-[#555]">No methodology recorded.</p>
                  )}
                </div>

                <div style={{ height: '1px', background: '#1c1c1c' }} />

                {/* ── Section 4: Diff View ── */}
                <div>
                  <div
                    className="font-mono text-[11px] uppercase text-[#333] mb-3"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Copy Comparison
                  </div>

                  {/* Subject */}
                  {(rewrite.step_copy_snapshot?.subject || rewrite.suggested_subject) && (
                    <div className="mb-4">
                      <div
                        className="font-mono text-[11px] uppercase text-[#333] mb-2"
                        style={{ letterSpacing: '0.08em' }}
                      >
                        Subject Line
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {/* Original */}
                        <div
                          className="rounded-md p-3"
                          style={{
                            background: '#0a0a0a',
                            borderLeft: '3px solid #f87171',
                            border: '1px solid #1a1a1a',
                            borderLeftColor: '#f87171',
                            borderLeftWidth: '3px',
                          }}
                        >
                          <span
                            className="font-mono text-[9px] uppercase text-[#444] block mb-1"
                            style={{ letterSpacing: '0.08em' }}
                          >
                            Original
                          </span>
                          <span className="font-sans text-[15px] text-[#888]">
                            {rewrite.step_copy_snapshot?.subject ?? '—'}
                          </span>
                        </div>
                        {/* Rewrite */}
                        <div
                          className="rounded-md p-3"
                          style={{
                            background: '#03100a',
                            borderLeft: '3px solid #22c55e',
                            border: '1px solid #0d3020',
                            borderLeftColor: '#22c55e',
                            borderLeftWidth: '3px',
                          }}
                        >
                          <span
                            className="font-mono text-[9px] uppercase text-[#444] block mb-1"
                            style={{ letterSpacing: '0.08em' }}
                          >
                            Rewrite
                          </span>
                          <span className="font-sans text-[15px] text-[#aaa]">
                            {rewrite.suggested_subject ?? '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Body */}
                  <div>
                    <div
                      className="font-mono text-[11px] uppercase text-[#333] mb-2"
                      style={{ letterSpacing: '0.08em' }}
                    >
                      Body
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {/* Original */}
                      <div
                        className="rounded-md p-3"
                        style={{
                          background: '#0a0a0a',
                          borderLeft: '3px solid #f87171',
                          border: '1px solid #1a1a1a',
                          borderLeftColor: '#f87171',
                          borderLeftWidth: '3px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                        }}
                      >
                        <span
                          className="font-mono text-[9px] uppercase text-[#444] block mb-1"
                          style={{ letterSpacing: '0.08em' }}
                        >
                          Original
                        </span>
                        <p className="font-sans text-[15px] text-[#888] whitespace-pre-wrap leading-relaxed">
                          {rewrite.step_copy_snapshot?.body ?? '—'}
                        </p>
                      </div>
                      {/* Rewrite */}
                      <div
                        className="rounded-md p-3"
                        style={{
                          background: '#03100a',
                          borderLeft: '3px solid #22c55e',
                          border: '1px solid #0d3020',
                          borderLeftColor: '#22c55e',
                          borderLeftWidth: '3px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                        }}
                      >
                        <span
                          className="font-mono text-[9px] uppercase text-[#444] block mb-1"
                          style={{ letterSpacing: '0.08em' }}
                        >
                          Rewrite
                        </span>
                        <p className="font-sans text-[15px] text-[#aaa] whitespace-pre-wrap leading-relaxed">
                          {rewrite.suggested_body ?? '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ height: '1px', background: '#1c1c1c' }} />

                {/* ── Section 5: Talking Points ── */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      className="font-mono text-[11px] uppercase text-[#333]"
                      style={{ letterSpacing: '0.08em' }}
                    >
                      Coaching Talking Points
                    </span>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 font-mono text-[13px] transition-colors duration-150 cursor-pointer rounded px-2 py-1"
                      style={{
                        color: copied ? '#22c55e' : '#555',
                        background: copied ? '#052010' : 'transparent',
                        border: copied ? '1px solid #0d3d1c' : '1px solid transparent',
                      }}
                      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#888' }}
                      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = '#555' }}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div
                    className="rounded-md p-4"
                    style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}
                  >
                    <p className="font-sans text-[15px] text-[#aaa] leading-relaxed">
                      {talkingPoints}
                    </p>
                  </div>
                </div>

                <div style={{ height: '1px', background: '#1c1c1c' }} />

                {/* ── Section 6: Regenerate ── */}
                <div className="space-y-2">
                  {generateError && (
                    <p className="font-sans text-[13px] text-[#f87171] text-right">
                      {generateError}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="flex items-center gap-2 font-mono text-[13px] rounded-md px-4 py-2 transition-colors duration-150"
                      style={{
                        background: generating ? '#0a0f1a' : '#0f1729',
                        border: '1px solid #1e3a5f',
                        color: generating ? '#2563aa' : '#3b82f6',
                        cursor: generating ? 'not-allowed' : 'pointer',
                        opacity: generating ? 0.6 : 1,
                      }}
                    >
                      <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
                      {generating ? 'Generating...' : 'Regenerate'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* ── Empty state: no rewrite data ── */
              <div className="flex flex-col items-center gap-4 py-12">
                <Sparkles size={24} style={{ color: '#333' }} />
                <p className="font-sans text-[17px] text-[#555] text-center">
                  No rewrite suggestion exists for this step yet.
                </p>
                {generateError && (
                  <p className="font-sans text-[13px] text-[#f87171] text-center">
                    {generateError}
                  </p>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 font-mono text-[13px] rounded-md px-4 py-2 transition-colors duration-150"
                  style={{
                    background: generating ? '#0a0f1a' : '#0f1729',
                    border: '1px solid #1e3a5f',
                    color: generating ? '#2563aa' : '#3b82f6',
                    cursor: generating ? 'not-allowed' : 'pointer',
                    opacity: generating ? 0.6 : 1,
                  }}
                >
                  {generating ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {generating ? 'Generating...' : 'Generate Rewrite'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
