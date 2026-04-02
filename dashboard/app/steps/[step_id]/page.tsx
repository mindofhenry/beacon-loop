'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type StepMetrics = {
  step_id: string
  step_number: number
  step_type: string | null
  step_intent: string | null
  sequence_id: string
  sequence_name: string | null
  send_volume: number
  open_count: number
  reply_count: number
  open_rate: number | null
  reply_rate: number | null
  flag_type: string
  flag_confidence: number | null
}

type RewriteSuggestion = {
  id: string
  diagnosis: string
  suggested_subject: string
  suggested_body: string
  model_used: string
  created_at: string
}

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function MetricCard({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg p-4">
      <p
        className="font-mono text-[9px] uppercase text-[#333] mb-2"
        style={{ letterSpacing: '0.08em' }}
      >
        {label}
      </p>
      <p className={`font-mono text-xl font-medium ${valueClassName ?? 'text-[#aaa]'}`}>{value}</p>
    </div>
  )
}

function MetricCardSmall({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg p-4">
      <p
        className="font-mono text-[9px] uppercase text-[#333] mb-2"
        style={{ letterSpacing: '0.08em' }}
      >
        {label}
      </p>
      <p className="font-mono text-sm text-[#aaa]">{value}</p>
    </div>
  )
}

export default function StepPage({
  params,
}: {
  params: Promise<{ step_id: string }>
}) {
  const { step_id } = use(params)
  const [metrics, setMetrics] = useState<StepMetrics | null>(null)
  const [suggestion, setSuggestion] = useState<RewriteSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [metricsRes, rewriteRes] = await Promise.all([
        supabase
          .from('step_performance')
          .select(
            'step_id, step_number, step_type, step_intent, sequence_id, sequence_name, send_volume, open_count, reply_count, open_rate, reply_rate, flag_type, flag_confidence'
          )
          .eq('step_id', step_id)
          .limit(1)
          .single(),
        supabase
          .from('rewrite_suggestions')
          .select('id, diagnosis, suggested_subject, suggested_body, model_used, created_at')
          .eq('step_id', step_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (metricsRes.error && metricsRes.error.code !== 'PGRST116') {
        setError(metricsRes.error.message)
        setLoading(false)
        return
      }

      setMetrics(metricsRes.data as StepMetrics | null)
      setSuggestion(rewriteRes.data as RewriteSuggestion | null)
      setLoading(false)
    }

    load()
  }, [step_id])

  const backHref = metrics ? `/sequences/${metrics.sequence_id}` : '/'
  const backLabel = metrics?.sequence_name ?? 'Back'

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#333] hover:text-[#888] transition-colors duration-150 cursor-pointer mb-6"
      >
        <ChevronLeft size={12} />
        {backLabel}
      </Link>

      {loading && (
        <>
          <div className="h-8 w-48 bg-[#1c1c1c] rounded animate-pulse mb-6" />
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-[#1c1c1c] rounded animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-40 bg-[#1c1c1c] rounded animate-pulse" />
            <div className="h-40 bg-[#1c1c1c] rounded animate-pulse" />
          </div>
        </>
      )}

      {error && (
        <p className="font-sans text-sm text-red-400">Error: {error}</p>
      )}

      {!loading && !error && metrics && (
        <>
          <p
            className="font-sans text-[13px] font-normal text-[#aaa] mb-6"
            style={{ letterSpacing: '0.04em' }}
          >
            step {metrics.step_number}
          </p>

          <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <MetricCard label="Send Volume" value={metrics.send_volume.toLocaleString()} />
            <MetricCard label="Opens" value={metrics.open_count.toLocaleString()} />
            <MetricCard label="Replies" value={metrics.reply_count.toLocaleString()} />
            <MetricCard
              label="Reply Rate"
              value={fmt(metrics.reply_rate)}
              valueClassName={metrics.flag_type !== 'none' ? 'text-[#f87171]' : undefined}
            />
            <MetricCard label="Open Rate" value={fmt(metrics.open_rate)} />
            <MetricCardSmall label="Flag Type" value={metrics.flag_type} />
          </div>

          {suggestion ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg p-5">
                <p
                  className="font-mono text-[9px] uppercase text-[#333] mb-3"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Diagnosis
                </p>
                <p className="font-sans text-[12px] text-[#aaa] whitespace-pre-wrap" style={{ lineHeight: '1.6' }}>
                  {suggestion.diagnosis}
                </p>
              </div>

              <div
                className="bg-[#0f0f0f] rounded-lg p-5"
                style={{ border: '1px solid #2a1515' }}
              >
                <p
                  className="font-mono text-[9px] uppercase text-[#333] mb-3"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Suggested Rewrite
                </p>
                <div className="mb-4">
                  <p
                    className="font-mono text-[9px] uppercase text-[#333] mb-1"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Subject
                  </p>
                  <p className="font-mono text-sm text-[#aaa]">{suggestion.suggested_subject}</p>
                </div>
                <div>
                  <p
                    className="font-mono text-[9px] uppercase text-[#333] mb-1"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Body
                  </p>
                  <p className="font-sans text-[12px] text-[#aaa] whitespace-pre-wrap" style={{ lineHeight: '1.6' }}>
                    {suggestion.suggested_body}
                  </p>
                </div>
                <p className="font-mono text-[10px] text-[#333] mt-4" style={{ letterSpacing: '0.04em' }}>
                  {suggestion.model_used} · {new Date(suggestion.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg p-8 flex items-center justify-center">
              <p className="font-mono text-[11px] text-[#333]" style={{ letterSpacing: '0.04em' }}>
                no rewrite suggestion generated yet
              </p>
            </div>
          )}
        </>
      )}

      {!loading && !error && !metrics && (
        <p className="font-sans text-sm text-[#555]">Step not found.</p>
      )}
    </div>
  )
}
