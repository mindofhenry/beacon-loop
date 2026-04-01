'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
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
  flag_confidence: number | null
}

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
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

      setSteps((data ?? []) as UnderperformingRow[])
      setLoading(false)
    }

    load()
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle size={20} className="text-amber-500" />
        <h1 className="font-mono text-xl font-semibold text-slate-100">
          Underperforming Steps
        </h1>
      </div>

      {loading && (
        <p className="text-slate-400 font-sans text-sm">Loading...</p>
      )}

      {error && (
        <p className="text-red-400 font-sans text-sm">Error: {error}</p>
      )}

      {!loading && !error && steps.length === 0 && (
        <p className="text-slate-400 font-sans text-sm">No underperforming steps found.</p>
      )}

      {!loading && !error && steps.length > 0 && (
        <div className="border border-[#262626] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#262626] bg-[#0f0f0f]">
                <th className="text-left px-4 py-3 font-sans font-medium text-slate-400">
                  Sequence
                </th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">
                  Step
                </th>
                <th className="text-left px-4 py-3 font-sans font-medium text-slate-400">
                  Type
                </th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">
                  Reply Rate
                </th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">
                  Send Volume
                </th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr
                  key={step.step_id}
                  onClick={() => router.push(`/steps/${step.step_id}`)}
                  className="border-b border-[#1a1a1a] hover:bg-[#0f0f0f] transition-colors duration-150 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-mono text-slate-100 text-xs">{step.sequence_id}</div>
                    {step.sequence_name && (
                      <div className="font-sans text-slate-400 text-xs mt-0.5">
                        {step.sequence_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{step.step_number}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-sans text-slate-300 text-xs">{step.step_type ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-amber-500">{fmt(step.reply_rate)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{step.send_volume.toLocaleString()}</span>
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
