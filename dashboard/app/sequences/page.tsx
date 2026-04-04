'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import TimeFilter from '@/components/TimeFilter'

// ─── Raw types from Supabase ──────────────────────────────────────────────────

type StepPerfRow = {
  sequence_id: string
  sequence_name: string | null
  step_id: string
  flag_type: string
  reply_rate: number | null
  open_rate: number | null
  rep_id: number | null
}

type RepRow = {
  id: number
  name: string
}

// ─── Aggregated type ──────────────────────────────────────────────────────────

type SequenceRow = {
  sequence_id: string
  sequence_name: string
  source: 'Outreach' | 'Salesloft'
  step_count: number
  flagged_count: number
  avg_reply_rate: number | null
  avg_open_rate: number | null
  rep_id: number | null
  rep_name: string
  health: number
}

// ─── Sort / filter types ──────────────────────────────────────────────────────

type SortKey = keyof Pick<
  SequenceRow,
  'sequence_name' | 'source' | 'rep_name' | 'step_count' | 'flagged_count' | 'avg_reply_rate' | 'avg_open_rate' | 'health'
>
type SortDir = 'asc' | 'desc'
type HealthFilter = 'all' | 'healthy' | 'at-risk' | 'critical'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function healthColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#f87171'
}

function aggregate(rows: StepPerfRow[], repsMap: Map<number, string>): SequenceRow[] {
  // Deduplicate by step_id first — step_performance has one row per pipeline run
  const seenStepIds = new Set<string>()
  const deduped = rows.filter((r) => {
    if (seenStepIds.has(r.step_id)) return false
    seenStepIds.add(r.step_id)
    return true
  })

  // Group by sequence_id
  type Accumulator = {
    sequence_id: string
    sequence_name: string
    source: 'Outreach' | 'Salesloft'
    step_count: number
    flagged_count: number
    reply_rates: number[]
    open_rates: number[]
    rep_id: number | null
  }

  const seqMap = new Map<string, Accumulator>()

  for (const row of deduped) {
    if (!seqMap.has(row.sequence_id)) {
      seqMap.set(row.sequence_id, {
        sequence_id: row.sequence_id,
        sequence_name: row.sequence_name ?? row.sequence_id,
        source: row.sequence_id.startsWith('sl_') ? 'Salesloft' : 'Outreach',
        step_count: 0,
        flagged_count: 0,
        reply_rates: [],
        open_rates: [],
        rep_id: null,
      })
    }
    const acc = seqMap.get(row.sequence_id)!
    acc.step_count++
    if (row.flag_type !== 'none') acc.flagged_count++
    if (row.reply_rate != null) acc.reply_rates.push(row.reply_rate)
    if (row.open_rate != null) acc.open_rates.push(row.open_rate)
    if (acc.rep_id == null && row.rep_id != null) acc.rep_id = row.rep_id
  }

  return Array.from(seqMap.values()).map((acc) => {
    const avg_reply_rate =
      acc.reply_rates.length > 0
        ? acc.reply_rates.reduce((a, b) => a + b, 0) / acc.reply_rates.length
        : null
    const avg_open_rate =
      acc.open_rates.length > 0
        ? acc.open_rates.reduce((a, b) => a + b, 0) / acc.open_rates.length
        : null

    return {
      sequence_id: acc.sequence_id,
      sequence_name: acc.sequence_name,
      source: acc.source,
      step_count: acc.step_count,
      flagged_count: acc.flagged_count,
      avg_reply_rate,
      avg_open_rate,
      rep_id: acc.rep_id,
      rep_name: acc.rep_id != null ? (repsMap.get(acc.rep_id) ?? '—') : '—',
      health: Math.max(0, 100 - acc.flagged_count * 15),
    }
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'Outreach' | 'Salesloft' }) {
  const isOR = source === 'Outreach'
  return (
    <span
      className="font-mono text-[10px] px-2 py-0.5 rounded"
      style={
        isOR
          ? { background: '#0d1526', color: '#3b82f6', border: '1px solid #1a2d4a' }
          : { background: '#141414', color: '#555', border: '1px solid #222' }
      }
    >
      {isOR ? 'OR' : 'SL'}
    </span>
  )
}

function HealthBar({ score }: { score: number }) {
  const color = healthColor(score)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
      <div
        style={{
          width: '72px',
          height: '4px',
          background: '#1c1c1c',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${score}%`,
            height: '100%',
            background: color,
            borderRadius: '2px',
            transition: 'width 300ms ease',
          }}
        />
      </div>
      <span className="font-mono text-[10px]" style={{ color, minWidth: '28px', textAlign: 'right' }}>
        {score}
      </span>
    </div>
  )
}

type SortIconProps = { col: SortKey; sortKey: SortKey; sortDir: SortDir }
function SortIcon({ col, sortKey, sortDir }: SortIconProps) {
  if (col !== sortKey) return <ChevronsUpDown size={10} style={{ color: '#333', flexShrink: 0 }} />
  if (sortDir === 'asc') return <ChevronUp size={10} style={{ color: '#888', flexShrink: 0 }} />
  return <ChevronDown size={10} style={{ color: '#888', flexShrink: 0 }} />
}

type ThProps = {
  label: string
  col: SortKey
  align?: 'left' | 'right'
  sortKey: SortKey
  sortDir: SortDir
  onSort: (col: SortKey) => void
}
function Th({ label, col, align = 'left', sortKey, sortDir, onSort }: ThProps) {
  return (
    <th
      className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onSort(col)}
    >
      <span
        className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        <span
          className="font-mono text-[9px] uppercase text-[#333]"
          style={{ letterSpacing: '0.08em' }}
        >
          {label}
        </span>
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

type FilterBarProps = {
  repNames: string[]
  repFilter: string
  onRepFilter: (v: string) => void
  sourceFilter: 'all' | 'Outreach' | 'Salesloft'
  onSourceFilter: (v: 'all' | 'Outreach' | 'Salesloft') => void
  healthFilter: HealthFilter
  onHealthFilter: (v: HealthFilter) => void
}

function FilterBar({
  repNames,
  repFilter,
  onRepFilter,
  sourceFilter,
  onSourceFilter,
  healthFilter,
  onHealthFilter,
}: FilterBarProps) {
  const selectStyle = {
    fontSize: '13px',
    color: '#aaa',
    background: '#111',
    border: '1px solid #1c1c1c',
    borderRadius: '4px',
    padding: '4px 8px',
    cursor: 'pointer',
    outline: 'none',
  } as const

  const toggleBase = {
    fontSize: '13px',
    padding: '4px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease',
  } as const

  function toggleStyle(active: boolean) {
    return {
      ...toggleBase,
      border: active ? '1px solid #252525' : '1px solid transparent',
      background: active ? '#161616' : 'transparent',
      color: active ? '#e5e5e5' : '#444',
    }
  }

  const sourceOpts: Array<{ v: 'all' | 'Outreach' | 'Salesloft'; label: string }> = [
    { v: 'all', label: 'All' },
    { v: 'Outreach', label: 'Outreach' },
    { v: 'Salesloft', label: 'Salesloft' },
  ]

  const healthOpts: Array<{ v: HealthFilter; label: string }> = [
    { v: 'all', label: 'All' },
    { v: 'healthy', label: 'Healthy' },
    { v: 'at-risk', label: 'At Risk' },
    { v: 'critical', label: 'Critical' },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      {/* Rep filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          className="font-mono text-[9px] uppercase text-[#333]"
          style={{ letterSpacing: '0.08em' }}
        >
          Rep
        </span>
        <select
          value={repFilter}
          onChange={(e) => onRepFilter(e.target.value)}
          className="font-mono"
          style={selectStyle}
        >
          <option value="">All</option>
          {repNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div style={{ width: '1px', height: '16px', background: '#1c1c1c' }} />

      {/* Source toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span
          className="font-mono text-[9px] uppercase text-[#333]"
          style={{ letterSpacing: '0.08em', marginRight: '4px' }}
        >
          Source
        </span>
        {sourceOpts.map(({ v, label }) => (
          <button key={v} onClick={() => onSourceFilter(v)} style={toggleStyle(sourceFilter === v)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ width: '1px', height: '16px', background: '#1c1c1c' }} />

      {/* Health toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span
          className="font-mono text-[9px] uppercase text-[#333]"
          style={{ letterSpacing: '0.08em', marginRight: '4px' }}
        >
          Health
        </span>
        {healthOpts.map(({ v, label }) => (
          <button key={v} onClick={() => onHealthFilter(v)} style={toggleStyle(healthFilter === v)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SequencesPage() {
  const router = useRouter()

  const [sequences, setSequences] = useState<SequenceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // TimeFilter — cosmetic this session
  const [timeFilter, setTimeFilter] = useState('30d')

  // Filter state
  const [repFilter, setRepFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'Outreach' | 'Salesloft'>('all')
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('sequence_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    async function load() {
      const [perfResult, repsResult] = await Promise.all([
        supabase
          .from('step_performance')
          .select('sequence_id, sequence_name, step_id, flag_type, reply_rate, open_rate, rep_id'),
        supabase.from('reps').select('id, name'),
      ])

      if (perfResult.error) {
        setError(perfResult.error.message)
        setLoading(false)
        return
      }
      if (repsResult.error) {
        setError(repsResult.error.message)
        setLoading(false)
        return
      }

      const repsMap = new Map<number, string>(
        ((repsResult.data ?? []) as RepRow[]).map((r) => [r.id, r.name])
      )

      const rows = (perfResult.data ?? []) as StepPerfRow[]
      setSequences(aggregate(rows, repsMap))
      setLoading(false)
    }

    load()
  }, [])

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(col)
      setSortDir('asc')
    }
  }

  const repNames = useMemo(
    () => Array.from(new Set(sequences.map((s) => s.rep_name).filter((n) => n !== '—'))).sort(),
    [sequences]
  )

  const filtered = useMemo(() => {
    return sequences.filter((s) => {
      if (repFilter && s.rep_name !== repFilter) return false
      if (sourceFilter !== 'all' && s.source !== sourceFilter) return false
      if (healthFilter === 'healthy' && s.health < 70) return false
      if (healthFilter === 'at-risk' && (s.health < 40 || s.health >= 70)) return false
      if (healthFilter === 'critical' && s.health >= 40) return false
      return true
    })
  }, [sequences, repFilter, sourceFilter, healthFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return sortDir === 'asc' ? 1 : -1
      if (bv == null) return sortDir === 'asc' ? -1 : 1
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return 0
    })
  }, [filtered, sortKey, sortDir])

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1
        className="font-sans text-[24px] font-semibold text-[#e5e5e5] mb-6"
      >
        Sequences
      </h1>

      {/* TimeFilter + filter bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
        <TimeFilter value={timeFilter} onChange={setTimeFilter} />
        {!loading && !error && (
          <FilterBar
            repNames={repNames}
            repFilter={repFilter}
            onRepFilter={setRepFilter}
            sourceFilter={sourceFilter}
            onSourceFilter={setSourceFilter}
            healthFilter={healthFilter}
            onHealthFilter={setHealthFilter}
          />
        )}
      </div>

      {error && <p className="font-sans text-sm text-red-400">Error: {error}</p>}

      {loading && (
        <div className="space-y-2">
          {['w-full', 'w-11/12', 'w-full', 'w-10/12', 'w-full'].map((w, i) => (
            <div key={i} className={`h-10 bg-[#1c1c1c] rounded animate-pulse ${w}`} />
          ))}
        </div>
      )}

      {!loading && !error && sorted.length === 0 && (
        <p className="font-sans text-sm text-[#555] py-8 text-center">
          No sequences match the current filters.
        </p>
      )}

      {!loading && !error && sorted.length > 0 && (
        <div className="border border-[#1c1c1c] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#0a0a0a] border-b border-[#1c1c1c] sticky top-0">
                <Th
                  label="Sequence"
                  col="sequence_name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <Th
                  label="Source"
                  col="source"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <Th
                  label="Rep"
                  col="rep_name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <Th
                  label="Steps"
                  col="step_count"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <Th
                  label="Flagged"
                  col="flagged_count"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <Th
                  label="Avg Reply"
                  col="avg_reply_rate"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <Th
                  label="Avg Open"
                  col="avg_open_rate"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <Th
                  label="Health"
                  col="health"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((seq) => (
                <tr
                  key={seq.sequence_id}
                  onClick={() => router.push(`/sequences/${seq.sequence_id}`)}
                  className="border-b border-b-[#1a1a1a] cursor-pointer transition-colors duration-150 hover:bg-[#0f0f0f]"
                >
                  <td className="px-4 py-3.5">
                    <div className="font-sans text-sm text-[#aaa]">{seq.sequence_name}</div>
                    <div
                      className="font-mono text-[10px] text-[#333] mt-0.5"
                      style={{ letterSpacing: '0.04em' }}
                    >
                      {seq.sequence_id}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <SourceBadge source={seq.source} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-sans text-xs text-[#555]">{seq.rep_name}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">{seq.step_count}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span
                      className="font-mono text-sm"
                      style={{ color: seq.flagged_count > 0 ? '#f87171' : '#555' }}
                    >
                      {seq.flagged_count}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">
                      {fmt(seq.avg_reply_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-sm text-[#aaa]">{fmt(seq.avg_open_rate)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <HealthBar score={seq.health} />
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
