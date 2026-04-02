'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type UnderperformingRow = {
  step_id: string
  sequence_id: string
  sequence_name: string | null
  step_number: number
  step_type: string | null
  step_intent: string | null
  reply_rate: number | null
  send_volume: number
  flag_type: string
}

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function FlagPill({ type }: { type: string }) {
  if (type === 'none') {
    return (
      <span
        className="font-mono text-[10px] px-2 py-0.5 rounded"
        style={{ background: '#141414', color: '#555', border: '1px solid #222' }}
      >
        {type}
      </span>
    )
  }
  return (
    <span
      className="font-mono text-[10px] px-2 py-0.5 rounded"
      style={{ background: '#1a0505', color: '#f87171', border: '1px solid #331010' }}
    >
      {type}
    </span>
  )
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

export default function UnderperformingPage() {
  const router = useRouter()
  const [steps, setSteps] = useState<UnderperformingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('step_performance')
        .select('step_id, sequence_id, sequence_name, step_number, step_type, step_intent, reply_rate, send_volume, flag_type, flag_confidence')
        .neq('flag_type', 'none')
        .order('flag_confidence', { ascending: false })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      // Deduplicate to one row per step_id — step_performance has one row per pipeline run
      const seenStepIds = new Set<string>()
      const rows = ((data ?? []) as UnderperformingRow[]).filter((r) => {
        if (seenStepIds.has(r.step_id)) return false
        seenStepIds.add(r.step_id)
        return true
      })
      setSteps(rows)
      setLoading(false)
    }

    load()
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <p
        className="font-sans text-[13px] font-normal text-[#aaa] mb-6"
        style={{ letterSpacing: '0.04em' }}
      >
        underperforming steps
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
        <p className="font-sans text-sm text-[#555] py-8 text-center">No flagged steps found.</p>
      )}

      {!loading && !error && steps.length > 0 && (
        <div className="border border-[#1c1c1c] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#0a0a0a] border-b border-[#1c1c1c] sticky top-0">
                <th className="text-left px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                    Sequence
                  </span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                    Step
                  </span>
                </th>
                <th className="text-left px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                    Type
                  </span>
                </th>
                <th className="text-left px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                    Intent
                  </span>
                </th>
                <th className="text-left px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                    Flag
                  </span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                    Reply Rate
                  </span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="font-mono text-[9px] uppercase text-[#333]" style={{ letterSpacing: '0.08em' }}>
                    Send Volume
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr
                  key={step.step_id}
                  onClick={() => router.push(`/steps/${step.step_id}`)}
                  className={`border-b border-b-[#1a1a1a] cursor-pointer transition-colors duration-150 hover:bg-[#0f0f0f] ${
                    step.flag_type !== 'none'
                      ? 'bg-[#0d0606] border-l-2 border-l-[#f87171]'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <div className="font-sans text-sm text-[#aaa]">
                      {step.sequence_name ?? step.sequence_id}
                    </div>
                    <div
                      className="font-mono text-[10px] text-[#333] mt-0.5"
                      style={{ letterSpacing: '0.04em' }}
                    >
                      {step.sequence_id}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">{step.step_number}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-sans text-xs text-[#555]">{step.step_type ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    {step.step_intent
                      ? <IntentPill>{step.step_intent}</IntentPill>
                      : <span className="font-mono text-[10px] text-[#333]">—</span>
                    }
                  </td>
                  <td className="px-4 py-3.5">
                    <FlagPill type={step.flag_type} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#f87171]">{fmt(step.reply_rate)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">{step.send_volume.toLocaleString()}</span>
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
