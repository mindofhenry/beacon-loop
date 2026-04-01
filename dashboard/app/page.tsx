'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type StepRow = {
  sequence_id: string
  sequence_name: string | null
  step_id: string
  reply_rate: number | null
  open_rate: number | null
  flagged: boolean
}

type SequenceSummary = {
  sequence_id: string
  sequence_name: string | null
  total_steps: number
  avg_reply_rate: number
  avg_open_rate: number
  flagged_count: number
}

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export default function SequenceHealthPage() {
  const router = useRouter()
  const [sequences, setSequences] = useState<SequenceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('step_performance')
        .select('sequence_id, sequence_name, step_id, reply_rate, open_rate, flagged')

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const rows = (data ?? []) as StepRow[]
      const map = new Map<string, SequenceSummary>()

      for (const row of rows) {
        if (!map.has(row.sequence_id)) {
          map.set(row.sequence_id, {
            sequence_id: row.sequence_id,
            sequence_name: row.sequence_name,
            total_steps: 0,
            avg_reply_rate: 0,
            avg_open_rate: 0,
            flagged_count: 0,
          })
        }
        const seq = map.get(row.sequence_id)!
        seq.total_steps++
        seq.avg_reply_rate += row.reply_rate ?? 0
        seq.avg_open_rate += row.open_rate ?? 0
        if (row.flagged) seq.flagged_count++
      }

      const result = Array.from(map.values()).map((seq) => ({
        ...seq,
        avg_reply_rate: seq.total_steps > 0 ? seq.avg_reply_rate / seq.total_steps : 0,
        avg_open_rate: seq.total_steps > 0 ? seq.avg_open_rate / seq.total_steps : 0,
      }))

      result.sort((a, b) => b.flagged_count - a.flagged_count)
      setSequences(result)
      setLoading(false)
    }

    load()
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="font-mono text-xl font-semibold text-slate-100 mb-6">
        Sequence Health Overview
      </h1>

      {loading && (
        <p className="text-slate-400 font-sans text-sm">Loading...</p>
      )}

      {error && (
        <p className="text-red-400 font-sans text-sm">Error: {error}</p>
      )}

      {!loading && !error && sequences.length === 0 && (
        <p className="text-slate-400 font-sans text-sm">No data found.</p>
      )}

      {!loading && !error && sequences.length > 0 && (
        <div className="border border-[#262626] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#262626] bg-[#0f0f0f]">
                <th className="text-left px-4 py-3 font-sans font-medium text-slate-400">
                  Sequence
                </th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">
                  Steps
                </th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">
                  Avg Reply Rate
                </th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">
                  Avg Open Rate
                </th>
                <th className="text-right px-4 py-3 font-sans font-medium text-slate-400">
                  Flagged Steps
                </th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((seq) => (
                <tr
                  key={seq.sequence_id}
                  onClick={() => router.push(`/sequences/${seq.sequence_id}`)}
                  className="border-b border-[#1a1a1a] hover:bg-[#0f0f0f] transition-colors duration-150 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-mono text-slate-100 text-xs">
                      {seq.sequence_id}
                    </div>
                    {seq.sequence_name && (
                      <div className="font-sans text-slate-400 text-xs mt-0.5">
                        {seq.sequence_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{seq.total_steps}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{fmt(seq.avg_reply_rate)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-slate-100">{fmt(seq.avg_open_rate)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {seq.flagged_count > 0 ? (
                      <span className="inline-flex items-center gap-1 font-mono text-amber-500">
                        <AlertTriangle size={14} />
                        {seq.flagged_count}
                      </span>
                    ) : (
                      <span className="font-mono text-slate-400">0</span>
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
