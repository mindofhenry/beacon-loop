'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-100 text-sm font-sans transition-colors duration-150 cursor-pointer mb-6"
      >
        <ChevronLeft size={16} />
        {metrics ? `Sequence ${metrics.sequence_id}` : 'Back'}
      </Link>

      {loading && (
        <p className="text-slate-400 font-sans text-sm">Loading...</p>
      )}

      {error && (
        <p className="text-red-400 font-sans text-sm">Error: {error}</p>
      )}

      {!loading && !error && metrics && (
        <>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              {metrics.flag_type !== 'none' && <AlertTriangle size={16} className="text-amber-500" />}
              <h1 className="font-mono text-xl font-semibold text-slate-100">
                Step {metrics.step_number}
              </h1>
              {metrics.step_type && (
                <span className="font-sans text-xs text-slate-400 bg-[#1a1a1a] px-2 py-0.5 rounded">
                  {metrics.step_type}
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-slate-400">{step_id}</p>
          </div>

          {/* Step Metrics Row */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <MetricCard label="Send Volume" value={metrics.send_volume.toLocaleString()} />
            <MetricCard label="Opens" value={metrics.open_count.toLocaleString()} />
            <MetricCard label="Replies" value={metrics.reply_count.toLocaleString()} />
            <MetricCard
              label="Reply Rate"
              value={fmt(metrics.reply_rate)}
              accent={metrics.flag_type !== 'none'}
            />
          </div>

          {/* Rewrite Panel */}
          {suggestion ? (
            <div className="grid grid-cols-2 gap-6">
              {/* Left: Diagnosis */}
              <div className="border border-[#262626] rounded-lg p-5 bg-[#0f0f0f]">
                <h2 className="font-sans text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  Diagnosis
                </h2>
                <p className="font-sans text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {suggestion.diagnosis}
                </p>
              </div>

              {/* Right: Rewrite */}
              <div className="border border-amber-500/30 rounded-lg p-5 bg-[#0f0f0f]">
                <h2 className="font-sans text-xs font-semibold text-amber-500 uppercase tracking-wider mb-4">
                  Suggested Rewrite
                </h2>
                <div className="mb-4">
                  <p className="font-sans text-xs text-slate-400 mb-1">Subject</p>
                  <p className="font-mono text-sm text-slate-100">{suggestion.suggested_subject}</p>
                </div>
                <div>
                  <p className="font-sans text-xs text-slate-400 mb-1">Body</p>
                  <p className="font-sans text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {suggestion.suggested_body}
                  </p>
                </div>
                <p className="font-mono text-xs text-slate-500 mt-4">
                  {suggestion.model_used} · {new Date(suggestion.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="border border-[#262626] rounded-lg p-6 text-center">
              <p className="font-sans text-sm text-slate-400">
                No rewrite suggestion generated yet.
              </p>
            </div>
          )}
        </>
      )}

      {!loading && !error && !metrics && (
        <p className="text-slate-400 font-sans text-sm">Step not found.</p>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="border border-[#262626] rounded-lg p-4 bg-[#0f0f0f]">
      <p className="font-sans text-xs text-slate-400 mb-1">{label}</p>
      <p className={`font-mono text-lg font-semibold ${accent ? 'text-amber-500' : 'text-slate-100'}`}>
        {value}
      </p>
    </div>
  )
}
