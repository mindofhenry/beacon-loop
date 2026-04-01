'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type StepRow = {
  id: string
  step_id: string
  step_number: number
  step_type: string | null
  send_volume: number
  open_count: number
  click_count: number
  reply_count: number
  open_rate: number | null
  reply_rate: number | null
  flagged: boolean
  sequence_id: string
  sequence_name: string | null
}

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
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
          'id, step_id, step_number, step_type, send_volume, open_count, click_count, reply_count, open_rate, reply_rate, flagged, sequence_id, sequence_name'
        )
        .eq('sequence_id', id)
        .order('step_number')

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const rows = (data ?? []) as StepRow[]
      setSteps(rows)
      if (rows.length > 0) setSequenceName(rows[0].sequence_name)
      setLoading(false)
    }

    load()
  }, [id])

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-100 text-sm font-sans transition-colors duration-150 cursor-pointer mb-6"
      >
        <ChevronLeft size={16} />
        All Sequences
      </Link>

      <div className="mb-6">
        <h1 className="font-mono text-xl font-semibold text-slate-100">
          {sequenceName ?? id}
        </h1>
        <p className="font-mono text-xs text-slate-400 mt-1">{id}</p>
      </div>

      {loading && (
        <p className="text-slate-400 font-sans text-sm">Loading...</p>
      )}

      {error && (
        <p className="text-red-400 font-sans text-sm">Error: {error}</p>
      )}

      {!loading && !error && steps.length === 0 && (
        <p className="text-slate-400 font-sans text-sm">No steps found for this sequence.</p>
      )}

      {!loading && !error && steps.length > 0 && (
        <div className="border border-[#262626] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#262626] bg-[#0f0f0f]">
                <th className="text-left px-4 py-3 font-sans font-medium text-slate-400">Step</th>
                <th className="text-left px-4 py-3 font-sans font-medium text-slate-400">Type</th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">Sends</th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">Opens</th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">Clicks</th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">Replies</th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">Open Rate</th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">Reply Rate</th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr
                  key={step.step_id}
                  onClick={() => step.flagged ? router.push(`/steps/${step.step_id}`) : undefined}
                  className={`border-b border-[#1a1a1a] transition-colors duration-150 ${
                    step.flagged
                      ? 'cursor-pointer hover:bg-[#1a0a00]'
                      : 'hover:bg-[#0f0f0f]'
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-slate-100">{step.step_number}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-sans text-slate-300 text-xs">{step.step_type ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{step.send_volume}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{step.open_count}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{step.click_count}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{step.reply_count}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{fmt(step.open_rate)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono ${step.flagged ? 'text-amber-500' : 'text-slate-100'}`}>
                      {fmt(step.reply_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {step.flagged ? (
                      <span className="inline-flex items-center gap-1 font-sans text-xs text-amber-500">
                        <AlertTriangle size={12} />
                        Flagged
                      </span>
                    ) : (
                      <span className="font-sans text-xs text-slate-400">OK</span>
                    )}
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
