'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRole } from '@/context/RoleContext'
import TimeFilter from '@/components/TimeFilter'

// ─── Types ───────────────────────────────────────────────────────────────────

type RepRow = {
  id: number
  name: string
  email: string
  role: string
  team: string
  source_user_id: string
}

type StepPerfRow = {
  id: string
  sequence_id: string
  step_id: string
  rep_id: number | null
  reply_rate: number | null
  open_rate: number | null
  flag_type: string
}

type AttrCreditRow = {
  step_id: string
  opportunity_id: string
}

type RepAgg = {
  rep_id: number
  name: string
  team: string
  role: string
  source: 'Outreach' | 'Salesloft' | 'Mixed'
  active_sequences: number
  avg_reply_rate: number | null
  avg_open_rate: number | null
  flagged_count: number
  pipeline_influenced: number
  health: number
}

type LeaderboardMetric = 'reply_rate' | 'pipeline' | 'flagged'
type SourceFilter = 'all' | 'Outreach' | 'Salesloft'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function healthColor(score: number): string {
  if (score >= 70) return '#16A34A'
  if (score >= 40) return '#F59E0B'
  return '#DC2626'
}

function seqSource(sequenceId: string): 'Outreach' | 'Salesloft' {
  return sequenceId.startsWith('sl_') ? 'Salesloft' : 'Outreach'
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: '13px',
    padding: '4px 10px',
    borderRadius: '4px',
    border: active ? '2px solid #1A1A1A' : '2px solid #D4D4D4',
    background: active ? '#1A1A1A' : '#FFFFFF',
    color: active ? '#FFFFFF' : '#525252',
    cursor: 'pointer',
    transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease',
  }
}

function aggregate(
  reps: RepRow[],
  perfRows: StepPerfRow[],
  attrCredits: AttrCreditRow[],
  sourceFilter: SourceFilter
): RepAgg[] {
  // Deduplicate step_performance by step_id
  const seenStepIds = new Set<string>()
  const deduped = perfRows.filter((r) => {
    if (seenStepIds.has(r.step_id)) return false
    seenStepIds.add(r.step_id)
    return true
  })

  // Apply source filter
  const filtered = sourceFilter === 'all'
    ? deduped
    : deduped.filter((r) => seqSource(r.sequence_id) === sourceFilter)

  // Build map: step_performance.id → rep_id (for attribution credit join)
  const perfIdToRepId = new Map<string, number | null>()
  for (const row of filtered) {
    perfIdToRepId.set(row.id, row.rep_id)
  }

  // Count distinct opportunities per rep from attribution credits
  const repOpps = new Map<number, Set<string>>()
  for (const credit of attrCredits) {
    const repId = perfIdToRepId.get(credit.step_id)
    if (repId == null) continue
    if (!repOpps.has(repId)) repOpps.set(repId, new Set())
    repOpps.get(repId)!.add(credit.opportunity_id)
  }

  // Group step_performance by rep_id
  type Acc = {
    sequences: Set<string>
    sources: Set<string>
    reply_rates: number[]
    open_rates: number[]
    flagged_count: number
  }
  const repAccs = new Map<number, Acc>()

  for (const row of filtered) {
    if (row.rep_id == null) continue
    if (!repAccs.has(row.rep_id)) {
      repAccs.set(row.rep_id, {
        sequences: new Set(),
        sources: new Set(),
        reply_rates: [],
        open_rates: [],
        flagged_count: 0,
      })
    }
    const acc = repAccs.get(row.rep_id)!
    acc.sequences.add(row.sequence_id)
    acc.sources.add(seqSource(row.sequence_id))
    if (row.reply_rate != null) acc.reply_rates.push(row.reply_rate)
    if (row.open_rate != null) acc.open_rates.push(row.open_rate)
    if (row.flag_type !== 'none') acc.flagged_count++
  }

  const repsMap = new Map(reps.map((r) => [r.id, r]))

  return reps
    .filter((r) => repAccs.has(r.id))
    .map((r) => {
      const acc = repAccs.get(r.id)!
      const avg_reply = acc.reply_rates.length > 0
        ? acc.reply_rates.reduce((a, b) => a + b, 0) / acc.reply_rates.length
        : null
      const avg_open = acc.open_rates.length > 0
        ? acc.open_rates.reduce((a, b) => a + b, 0) / acc.open_rates.length
        : null

      const sources = Array.from(acc.sources)
      const source: 'Outreach' | 'Salesloft' | 'Mixed' =
        sources.length === 1 ? (sources[0] as 'Outreach' | 'Salesloft') : 'Mixed'

      return {
        rep_id: r.id,
        name: r.name,
        team: r.team,
        role: r.role,
        source,
        active_sequences: acc.sequences.size,
        avg_reply_rate: avg_reply,
        avg_open_rate: avg_open,
        flagged_count: acc.flagged_count,
        pipeline_influenced: repOpps.get(r.id)?.size ?? 0,
        health: Math.max(0, 100 - acc.flagged_count * 15),
      }
    })
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'Outreach' | 'Salesloft' | 'Mixed' }) {
  if (source === 'Mixed') {
    return (
      <span className="font-mono text-[13px] px-2 py-0.5 rounded"
        style={{ background: '#F5F5F5', color: '#737373', border: '1px solid #D4D4D4' }}>
        OR/SL
      </span>
    )
  }
  const isOR = source === 'Outreach'
  return (
    <span className="font-mono text-[13px] px-2 py-0.5 rounded"
      style={isOR
        ? { background: '#DBEAFE', color: '#2563EB', border: '1px solid #2563EB' }
        : { background: '#F5F5F5', color: '#737373', border: '1px solid #D4D4D4' }
      }>
      {isOR ? 'OR' : 'SL'}
    </span>
  )
}

function HealthBar({ score }: { score: number }) {
  const color = healthColor(score)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
      <div style={{ width: '72px', height: '4px', background: '#E5E5E5', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 300ms ease' }} />
      </div>
      <span className="font-mono text-[13px]" style={{ color, minWidth: '28px', textAlign: 'right' }}>
        {score}
      </span>
    </div>
  )
}

function TrendArrow() {
  // Trend requires multi-run comparison data — showing flat for now
  return <Minus size={14} style={{ color: '#A3A3A3' }} />
}

function MetricValue({ rep, metric }: { rep: RepAgg; metric: LeaderboardMetric }) {
  switch (metric) {
    case 'reply_rate':
      return <span className="font-mono text-[17px] text-[#525252]">{fmt(rep.avg_reply_rate)}</span>
    case 'pipeline':
      return <span className="font-mono text-[17px] text-[#525252]">{rep.pipeline_influenced} opps</span>
    case 'flagged':
      return (
        <span className="font-mono text-[17px]" style={{ color: rep.flagged_count > 0 ? '#DC2626' : '#737373' }}>
          {rep.flagged_count} flagged
        </span>
      )
  }
}

function LeaderboardCard({ rep, metric, onClick }: { rep: RepAgg; metric: LeaderboardMetric; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '12px 16px', background: 'transparent',
        border: 'none', borderBottom: '1px solid #E5E5E5', cursor: 'pointer',
        textAlign: 'left', transition: 'background 150ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="font-sans text-[17px] text-[#1A1A1A]">{rep.name}</span>
        <SourceBadge source={rep.source} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <MetricValue rep={rep} metric={metric} />
        <TrendArrow />
      </div>
    </button>
  )
}

function Leaderboard({
  reps,
  metric,
  onMetricChange,
  onRepClick,
}: {
  reps: RepAgg[]
  metric: LeaderboardMetric
  onMetricChange: (m: LeaderboardMetric) => void
  onRepClick: (repId: number) => void
}) {
  const { top, bottom } = useMemo(() => {
    const sorted = [...reps]
    // For flagged: ascending = best (fewer flags). For reply_rate/pipeline: descending = best.
    if (metric === 'flagged') {
      sorted.sort((a, b) => a.flagged_count - b.flagged_count)
    } else if (metric === 'pipeline') {
      sorted.sort((a, b) => b.pipeline_influenced - a.pipeline_influenced)
    } else {
      sorted.sort((a, b) => (b.avg_reply_rate ?? 0) - (a.avg_reply_rate ?? 0))
    }
    const count = reps.length <= 6 ? 2 : 3
    return {
      top: sorted.slice(0, count),
      bottom: sorted.slice(-count).reverse(),
    }
  }, [reps, metric])

  const metricOpts: { v: LeaderboardMetric; label: string }[] = [
    { v: 'reply_rate', label: 'Reply Rate' },
    { v: 'pipeline', label: 'Pipeline' },
    { v: 'flagged', label: 'Flagged' },
  ]

  return (
    <div>
      {/* Metric selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px' }}>
        <span className="font-mono text-[11px] uppercase text-[#A3A3A3]"
          style={{ letterSpacing: '0.08em', marginRight: '4px' }}>
          Rank by
        </span>
        {metricOpts.map(({ v, label }) => (
          <button key={v} onClick={() => onMetricChange(v)} style={toggleStyle(metric === v)}>
            {label}
          </button>
        ))}
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Top Performers */}
        <div className="border-2 border-[#1A1A1A] rounded-lg overflow-hidden">
          <div style={{ padding: '12px 16px', borderBottom: '2px solid #1A1A1A', background: '#F5F5F5' }}>
            <span className="font-mono text-[11px] uppercase text-[#16A34A]"
              style={{ letterSpacing: '0.08em' }}>
              Top Performers
            </span>
          </div>
          {top.map((rep) => (
            <LeaderboardCard key={rep.rep_id} rep={rep} metric={metric} onClick={() => onRepClick(rep.rep_id)} />
          ))}
        </div>

        {/* Needs Attention */}
        <div className="border-2 border-[#1A1A1A] rounded-lg overflow-hidden">
          <div style={{ padding: '12px 16px', borderBottom: '2px solid #1A1A1A', background: '#F5F5F5' }}>
            <span className="font-mono text-[11px] uppercase text-[#DC2626]"
              style={{ letterSpacing: '0.08em' }}>
              Needs Attention
            </span>
          </div>
          {bottom.map((rep) => (
            <LeaderboardCard key={rep.rep_id} rep={rep} metric={metric} onClick={() => onRepClick(rep.rep_id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TeamTable({ reps, onRepClick }: { reps: RepAgg[]; onRepClick: (repId: number) => void }) {
  const grouped = useMemo(() => {
    const teams = new Map<string, RepAgg[]>()
    for (const rep of reps) {
      if (!teams.has(rep.team)) teams.set(rep.team, [])
      teams.get(rep.team)!.push(rep)
    }
    // Sort teams alphabetically, reps by name within each team
    return Array.from(teams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([team, members]) => ({
        team,
        members: [...members].sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }, [reps])

  const thStyle = "font-mono text-[9px] uppercase text-[#A3A3A3]"
  const thLetterSpacing = { letterSpacing: '0.08em' } as const

  return (
    <div className="border-2 border-[#1A1A1A] rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-[#F5F5F5] border-b-2 border-[#1A1A1A] sticky top-0">
            <th className="text-left px-4 py-3">
              <span className={thStyle} style={thLetterSpacing}>Rep</span>
            </th>
            <th className="text-right px-4 py-3">
              <span className={thStyle} style={thLetterSpacing}>Sequences</span>
            </th>
            <th className="text-right px-4 py-3">
              <span className={thStyle} style={thLetterSpacing}>Avg Reply</span>
            </th>
            <th className="text-right px-4 py-3">
              <span className={thStyle} style={thLetterSpacing}>Avg Open</span>
            </th>
            <th className="text-right px-4 py-3">
              <span className={thStyle} style={thLetterSpacing}>Flagged</span>
            </th>
            <th className="text-right px-4 py-3">
              <span className={thStyle} style={thLetterSpacing}>Pipeline</span>
            </th>
            <th className="text-right px-4 py-3">
              <span className={thStyle} style={thLetterSpacing}>Health</span>
            </th>
            <th className="text-right px-4 py-3">
              <span className={thStyle} style={thLetterSpacing}>Trend</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ team, members }) => (
            <TeamGroup key={team} team={team} members={members} onRepClick={onRepClick} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TeamGroup({ team, members, onRepClick }: { team: string; members: RepAgg[]; onRepClick: (repId: number) => void }) {
  return (
    <>
      {/* Team header row */}
      <tr>
        <td colSpan={8} style={{ padding: '10px 16px', background: '#F5F5F5', borderBottom: '1px solid #E5E5E5' }}>
          <span className="font-mono text-[11px] uppercase text-[#737373]"
            style={{ letterSpacing: '0.08em' }}>
            {team}
          </span>
          <span className="font-mono text-[11px] text-[#A3A3A3] ml-2">
            ({members.length})
          </span>
        </td>
      </tr>
      {members.map((rep) => (
        <tr
          key={rep.rep_id}
          onClick={() => onRepClick(rep.rep_id)}
          className="border-b border-b-[#E5E5E5] cursor-pointer transition-colors duration-150 hover:bg-[#F5F5F5]"
        >
          <td className="px-4 py-3.5">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="font-sans text-[17px] text-[#525252]">{rep.name}</span>
              <SourceBadge source={rep.source} />
            </div>
          </td>
          <td className="px-4 py-3.5 text-right">
            <span className="font-mono text-[17px] text-[#525252]">{rep.active_sequences}</span>
          </td>
          <td className="px-4 py-3.5 text-right">
            <span className="font-mono text-[17px] text-[#525252]">{fmt(rep.avg_reply_rate)}</span>
          </td>
          <td className="px-4 py-3.5 text-right">
            <span className="font-mono text-[17px] text-[#525252]">{fmt(rep.avg_open_rate)}</span>
          </td>
          <td className="px-4 py-3.5 text-right">
            <span className="font-mono text-[17px]" style={{ color: rep.flagged_count > 0 ? '#DC2626' : '#737373' }}>
              {rep.flagged_count}
            </span>
          </td>
          <td className="px-4 py-3.5 text-right">
            <span className="font-mono text-[17px] text-[#525252]">{rep.pipeline_influenced}</span>
          </td>
          <td className="px-4 py-3.5">
            <HealthBar score={rep.health} />
          </td>
          <td className="px-4 py-3.5 text-right">
            <TrendArrow />
          </td>
        </tr>
      ))}
    </>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RepsPage() {
  const router = useRouter()
  const { role } = useRole()

  const [repsData, setRepsData] = useState<RepRow[]>([])
  const [perfData, setPerfData] = useState<StepPerfRow[]>([])
  const [attrCredits, setAttrCredits] = useState<AttrCreditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [timeFilter, setTimeFilter] = useState('30d')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>('reply_rate')

  useEffect(() => {
    async function load() {
      const [repsResult, perfResult, attrResult] = await Promise.all([
        supabase.from('reps').select('id, name, email, role, team, source_user_id'),
        supabase.from('step_performance').select('id, sequence_id, step_id, rep_id, reply_rate, open_rate, flag_type'),
        supabase.from('step_attribution_credit').select('step_id, opportunity_id'),
      ])

      if (repsResult.error) { setError(repsResult.error.message); setLoading(false); return }
      if (perfResult.error) { setError(perfResult.error.message); setLoading(false); return }
      if (attrResult.error) { setError(attrResult.error.message); setLoading(false); return }

      setRepsData((repsResult.data ?? []) as RepRow[])
      setPerfData((perfResult.data ?? []) as StepPerfRow[])
      setAttrCredits((attrResult.data ?? []) as AttrCreditRow[])
      setLoading(false)
    }
    load()
  }, [])

  const reps = useMemo(
    () => aggregate(repsData, perfData, attrCredits, sourceFilter),
    [repsData, perfData, attrCredits, sourceFilter]
  )

  // Role-based filtering
  // TODO: Rep role should show only their own profile. Currently no mapping
  // from the role selector to a specific rep_id exists in the RoleContext.
  // For now, all reps are shown for all roles.
  const visibleReps = reps

  function handleRepClick(repId: number) {
    router.push(`/reps/${repId}`)
  }

  const sourceOpts: { v: SourceFilter; label: string }[] = [
    { v: 'all', label: 'All' },
    { v: 'Outreach', label: 'Outreach' },
    { v: 'Salesloft', label: 'Salesloft' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="font-sans text-[24px] font-semibold text-[#1A1A1A] mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Reps
      </h1>

      {/* Filter bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        <TimeFilter value={timeFilter} onChange={setTimeFilter} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="font-mono text-[11px] uppercase text-[#A3A3A3]"
            style={{ letterSpacing: '0.08em', marginRight: '4px' }}>
            Source
          </span>
          {sourceOpts.map(({ v, label }) => (
            <button key={v} onClick={() => setSourceFilter(v)} style={toggleStyle(sourceFilter === v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="font-sans text-[17px] text-red-400">Error: {error}</p>}

      {loading && (
        <div className="space-y-2">
          {['w-full', 'w-11/12', 'w-full', 'w-10/12', 'w-full'].map((w, i) => (
            <div key={i} className={`h-12 bg-[#E5E5E5] rounded animate-pulse ${w}`} />
          ))}
        </div>
      )}

      {!loading && !error && visibleReps.length === 0 && (
        <p className="font-sans text-[17px] text-[#737373] py-8 text-center">
          No reps match the current filters.
        </p>
      )}

      {!loading && !error && visibleReps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Leaderboard */}
          <Leaderboard
            reps={visibleReps}
            metric={leaderboardMetric}
            onMetricChange={setLeaderboardMetric}
            onRepClick={handleRepClick}
          />

          {/* Team Table */}
          <div>
            <h2 className="font-sans text-[19px] font-semibold text-[#1A1A1A] mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Team View
            </h2>
            <TeamTable reps={visibleReps} onRepClick={handleRepClick} />
          </div>
        </div>
      )}
    </div>
  )
}
