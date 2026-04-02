'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type StepRow = {
  id: string
  step_id: string
  step_number: number
  step_type: string | null
  step_intent: string | null
  send_volume: number
  open_count: number
  click_count: number
  reply_count: number
  open_rate: number | null
  reply_rate: number | null
  flag_type: string
  flag_confidence: number | null
  sequence_id: string
  sequence_name: string | null
}

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function IntentPill({ children }: { children: string }) {
  return (
    <span
      className="font-mono text-[10px] px-2 py-0.5 rounded"
      style={{ background: '#141414', color: '#555', border: '1px solid #222' }}
    >
      {children}
    </span>
  )
}

function StatusPill({ flagType }: { flagType: string }) {
  if (flagType !== 'none') {
    return (
      <span
        className="font-mono text-[10px] px-2 py-0.5 rounded"
        style={{ background: '#1a0505', color: '#f87171', border: '1px solid #331010' }}
      >
        flagged
      </span>
    )
  }
  return (
    <span
      className="font-mono text-[10px] px-2 py-0.5 rounded"
      style={{ background: '#141414', color: '#555', border: '1px solid #222' }}
    >
      ok
    </span>
  )
}

export default function SequencePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [steps, setSteps] = useState<StepRow[]>([])
  const [sequenceName, setSequenceName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('step_performance')
        .select(
          'id, step_id, step_number, step_type, step_intent, send_volume, open_count, click_count, reply_count, open_rate, reply_rate, flag_type, flag_confidence, sequence_id, sequence_name'
        )
        .eq('sequence_id', id)
        .order('step_number')

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      // Deduplicate to one row per step_id — step_performance has one row per
      // pipeline run, so multiple runs produce duplicate step_ids.
      const seenStepIds = new Set<string>()
      const rows = ((data ?? []) as StepRow[]).filter((r) => {
        if (seenStepIds.has(r.step_id)) return false
        seenStepIds.add(r.step_id)
        return true
      })
      setSteps(rows)
      if (rows.length > 0) setSequenceName(rows[0].sequence_name)
      setLoading(false)
    }

    load()
  }, [id])

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <button
        onClick={() => router.push('/')}
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#333] hover:text-[#888] transition-colors duration-150 cursor-pointer mb-6"
      >
        <ChevronLeft size={12} />
        All Sequences
      </button>

      <p
        className="font-sans text-[13px] font-normal text-[#aaa] mb-6"
        style={{ letterSpacing: '0.04em' }}
      >
        {sequenceName ?? id}
      </p>

      {error && (
        <p className="font-sans text-sm text-red-400">Error: {error}</p>
      )}

      {loading && (
        <div className="space-y-2">
          {['w-full', 'w-11/12', 'w-full', 'w-10/12', 'w-full'].map((w, i) => (
            <div key={i} className={`h-10 bg-[#1c1c1c] rounded animate-pulse ${w}`} />
          ))}
        </div>
      )}

      {!loading && !error && steps.length === 0 && (
        <p className="font-sans text-sm text-[#555] py-8 text-center">No steps found for this sequence.</p>
      )}

      {!loading && !error && steps.length > 0 && (
        <div className="border border-[#1c1c1c] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#0a0a0a] border-b border-[#1c1c1c] sticky top-0">
                <th className="text-left px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Step</span>
                </th>
                <th className="text-left px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Type</span>
                </th>
                <th className="text-left px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Intent</span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Sends</span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Opens</span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Clicks</span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Replies</span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Open Rate</span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Reply Rate</span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr
                  key={step.step_id}
                  onClick={() => step.flag_type !== 'none' ? router.push(`/steps/${step.step_id}`) : undefined}
                  className={`border-b border-b-[#1a1a1a] transition-colors duration-150 hover:bg-[#0f0f0f] ${
                    step.flag_type !== 'none'
                      ? 'bg-[#0d0606] border-l-2 border-l-[#f87171] cursor-pointer'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm text-[#aaa]">{step.step_number}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-sans text-xs text-[#555]">{step.step_type ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    {step.step_intent
                      ? <IntentPill>{step.step_intent}</IntentPill>
                      : <span className="font-sans text-xs text-[#555]">—</span>
                    }
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">{step.send_volume}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">{step.open_count}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">{step.click_count}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">{step.reply_count}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">{fmt(step.open_rate)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`font-mono text-sm ${step.flag_type !== 'none' ? 'text-[#f87171]' : 'text-[#aaa]'}`}>
                      {fmt(step.reply_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <StatusPill flagType={step.flag_type} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
