'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRole } from '@/context/RoleContext'
import { useRewriteDrawer } from '@/context/RewriteDrawerContext'
import TimeFilter from '@/components/TimeFilter'
import AskBeacon from '@/components/AskBeacon'

// --- Types ---

type FlaggedStep = {
  step_id: string
  sequence_id: string
  sequence_name: string | null
  step_number: number
  step_type: string | null
  step_intent: string | null
  reply_rate: number | null
  open_rate: number | null
  send_volume: number
  flag_type: string
  flag_confidence: number | null
  rep_id: number | null
  messaging_theme: string | null
}

type RepRow = {
  id: number
  name: string
  role: string
}

type GroupMode = 'rep' | 'sequence' | 'flat'
type SeverityFilter = 'all' | 'high' | 'medium' | 'low'

// --- Helpers ---

function fmt(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function severityColor(confidence: number | null): string {
  if (confidence == null) return '#737373'
  if (confidence >= 0.8) return '#DC2626'
  if (confidence >= 0.5) return '#F59E0B'
  return '#737373'
}

function severityLabel(confidence: number | null): string {
  if (confidence == null) return 'unknown'
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

function defaultGroupMode(role: string): GroupMode {
  if (role === 'manager') return 'rep'
  if (role === 'revops') return 'sequence'
  return 'flat'
}

// --- Toggle button style ---

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

// --- Pill components ---

function FlagPill({ type }: { type: string }) {
  return (
    <span
      className="font-mono text-[13px] px-2 py-0.5 rounded"
      style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #DC2626' }}
    >
      {type}
    </span>
  )
}

function TypeIntentPill({ children }: { children: string }) {
  return (
    <span
      className="font-mono text-[13px] px-2 py-0.5 rounded"
      style={{ background: '#F5F5F5', color: '#737373', border: '1px solid #D4D4D4' }}
    >
      {children}
    </span>
  )
}

function ThemePill({ theme }: { theme: string }) {
  return (
    <span
      className="font-mono text-[13px] px-2 py-0.5 rounded"
      style={{ background: '#DBEAFE', color: '#2563EB', border: '1px solid #2563EB' }}
    >
      {theme.replace(/_/g, ' ')}
    </span>
  )
}

// --- Severity dot ---

function SeverityDot({ confidence }: { confidence: number | null }) {
  const color = severityColor(confidence)
  return (
    <span
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
      title={`Confidence: ${confidence != null ? (confidence * 100).toFixed(0) + '%' : 'unknown'}`}
    />
  )
}

// --- Group header ---

function GroupHeader({
  name,
  count,
  worstReplyRate,
}: {
  name: string
  count: number
  worstReplyRate: number | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        marginTop: '16px',
        borderBottom: '2px solid #1A1A1A',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="font-sans text-[17px] text-[#1A1A1A]">{name}</span>
        <span
          className="font-mono text-[13px] px-2 py-0.5 rounded"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #DC2626' }}
        >
          {count} flagged
        </span>
      </div>
      {worstReplyRate != null && (
        <span className="font-mono text-[13px] text-[#737373]">
          worst reply: <span style={{ color: '#DC2626' }}>{fmt(worstReplyRate)}</span>
        </span>
      )}
    </div>
  )
}

// --- Expandable card ---

function StepCard({
  step,
  expanded,
  onToggle,
  groupMode,
  repName,
  onViewRewrite,
}: {
  step: FlaggedStep
  expanded: boolean
  onToggle: () => void
  groupMode: GroupMode
  repName: string
  onViewRewrite: (stepId: string) => void
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState(0)

  useEffect(() => {
    if (expanded && contentRef.current) {
      setMaxHeight(contentRef.current.scrollHeight)
    } else {
      setMaxHeight(0)
    }
  }, [expanded])

  const ChevronIcon = expanded ? ChevronDown : ChevronRight

  return (
    <div
      style={{
        borderBottom: '1px solid #E5E5E5',
        background: expanded ? '#F5F5F5' : '#FFFFFF',
        transition: 'background 200ms ease',
      }}
    >
      {/* Collapsed row */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 150ms ease',
        }}
        onMouseEnter={(e) => {
          if (!expanded) e.currentTarget.style.background = '#F5F5F5'
        }}
        onMouseLeave={(e) => {
          if (!expanded) e.currentTarget.style.background = 'transparent'
        }}
      >
        <ChevronIcon size={14} style={{ color: '#737373', flexShrink: 0 }} />

        <SeverityDot confidence={step.flag_confidence} />

        <span className="font-sans text-[17px] text-[#525252]" style={{ minWidth: 0, flex: '1 1 auto' }}>
          {step.sequence_name ?? step.sequence_id}
          <span className="text-[#737373]"> — Step {step.step_number}</span>
          {groupMode === 'flat' && repName !== '—' && (
            <span className="font-mono text-[13px] text-[#A3A3A3] ml-3">{repName}</span>
          )}
        </span>

        <span style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {step.step_type && <TypeIntentPill>{step.step_type}</TypeIntentPill>}
          {step.step_intent && <TypeIntentPill>{step.step_intent}</TypeIntentPill>}
        </span>

        <span className="font-mono text-[17px]" style={{ color: '#DC2626', flexShrink: 0, minWidth: '52px', textAlign: 'right' }}>
          {fmt(step.reply_rate)}
        </span>

        <FlagPill type={step.flag_type} />
      </button>

      {/* Expanded detail */}
      <div
        ref={contentRef}
        style={{
          maxHeight: expanded ? `${maxHeight}px` : '0px',
          overflow: 'hidden',
          transition: 'max-height 200ms ease',
        }}
      >
        <div
          style={{
            padding: '0 16px 16px 42px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
            <div>
              <span
                className="font-mono text-[11px] uppercase text-[#A3A3A3]"
                style={{ letterSpacing: '0.08em' }}
              >
                Send Volume
              </span>
              <div className="font-mono text-[17px] text-[#525252]">{step.send_volume.toLocaleString()}</div>
            </div>

            <div>
              <span
                className="font-mono text-[11px] uppercase text-[#A3A3A3]"
                style={{ letterSpacing: '0.08em' }}
              >
                Open Rate
              </span>
              <div className="font-mono text-[17px] text-[#525252]">{fmt(step.open_rate)}</div>
            </div>

            <div>
              <span
                className="font-mono text-[11px] uppercase text-[#A3A3A3]"
                style={{ letterSpacing: '0.08em' }}
              >
                Confidence
              </span>
              <div className="font-mono text-[17px]" style={{ color: severityColor(step.flag_confidence) }}>
                {step.flag_confidence != null ? `${(step.flag_confidence * 100).toFixed(0)}%` : '—'}
              </div>
            </div>

            {step.messaging_theme && (
              <div>
                <span
                  className="font-mono text-[11px] uppercase text-[#A3A3A3]"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Theme
                </span>
                <div style={{ marginTop: '2px' }}>
                  <ThemePill theme={step.messaging_theme} />
                </div>
              </div>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onViewRewrite(step.step_id) }}
            className="font-mono text-[13px] transition-colors duration-150 cursor-pointer"
            style={{ color: '#2563EB', background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#3B82F6' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#2563EB' }}
          >
            View rewrite →
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Page ---

export default function InsightsPage() {
  const { role } = useRole()
  const { openDrawer } = useRewriteDrawer()

  const [steps, setSteps] = useState<FlaggedStep[]>([])
  const [repsMap, setRepsMap] = useState<Map<number, string>>(new Map())
  const [demoRepId, setDemoRepId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [groupMode, setGroupMode] = useState<GroupMode>('rep')
  const [roleInitialized, setRoleInitialized] = useState(false)

  const [timeFilter, setTimeFilter] = useState('7d')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [flagTypeFilter, setFlagTypeFilter] = useState('all')

  const [expandedMap, setExpandedMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!roleInitialized) {
      setGroupMode(defaultGroupMode(role))
      setRoleInitialized(true)
    }
  }, [role, roleInitialized])

  useEffect(() => {
    async function load() {
      const [perfResult, repsResult] = await Promise.all([
        supabase
          .from('step_performance')
          .select('step_id, sequence_id, sequence_name, step_number, step_type, step_intent, reply_rate, open_rate, send_volume, flag_type, flag_confidence, rep_id, messaging_theme')
          .neq('flag_type', 'none')
          .order('flag_confidence', { ascending: false }),
        supabase.from('reps').select('id, name, role'),
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

      const reps = (repsResult.data ?? []) as RepRow[]
      const map = new Map<number, string>(reps.map((r) => [r.id, r.name]))
      setRepsMap(map)

      if (reps.length > 0) {
        setDemoRepId(reps[0].id)
      }

      const seenStepIds = new Set<string>()
      const rows = ((perfResult.data ?? []) as FlaggedStep[]).filter((r) => {
        if (seenStepIds.has(r.step_id)) return false
        seenStepIds.add(r.step_id)
        return true
      })

      setSteps(rows)
      setLoading(false)
    }

    load()
  }, [])

  const distinctFlagTypes = useMemo(
    () => Array.from(new Set(steps.map((s) => s.flag_type))).sort(),
    [steps]
  )

  const distinctStepTypes = useMemo(
    () => Array.from(new Set(steps.map((s) => s.step_type).filter(Boolean) as string[])).sort(),
    [steps]
  )

  const askBeaconContext = useMemo(() => {
    if (!steps.length) return undefined
    const summary = steps.slice(0, 30).map((s) => ({
      sequence: s.sequence_name ?? s.sequence_id,
      step: s.step_number,
      type: s.step_type,
      intent: s.step_intent,
      reply_rate: s.reply_rate,
      open_rate: s.open_rate,
      send_volume: s.send_volume,
      flag: s.flag_type,
      confidence: s.flag_confidence,
      rep: s.rep_id != null ? (repsMap.get(s.rep_id) ?? 'Unknown') : 'Unassigned',
      theme: s.messaging_theme,
    }))
    return `Flagged steps (${steps.length} total, top 30 shown):\n${JSON.stringify(summary, null, 2)}`
  }, [steps, repsMap])

  const filtered = useMemo(() => {
    return steps.filter((s) => {
      if (groupMode === 'flat' && role === 'rep' && demoRepId != null && s.rep_id !== demoRepId) {
        return false
      }
      if (severityFilter !== 'all') {
        const label = severityLabel(s.flag_confidence)
        if (label !== severityFilter) return false
      }
      if (typeFilter !== 'all' && s.step_type !== typeFilter) return false
      if (flagTypeFilter !== 'all' && s.flag_type !== flagTypeFilter) return false
      return true
    })
  }, [steps, groupMode, role, demoRepId, severityFilter, typeFilter, flagTypeFilter])

  const grouped = useMemo(() => {
    if (groupMode === 'flat') {
      return [{ key: '__flat__', name: '', steps: filtered }]
    }

    const map = new Map<string, { name: string; steps: FlaggedStep[] }>()

    for (const step of filtered) {
      let key: string
      let name: string

      if (groupMode === 'rep') {
        const repId = step.rep_id
        key = repId != null ? String(repId) : '__no_rep__'
        name = repId != null ? (repsMap.get(repId) ?? 'Unknown Rep') : 'Unassigned'
      } else {
        key = step.sequence_id
        name = step.sequence_name ?? step.sequence_id
      }

      if (!map.has(key)) {
        map.set(key, { name, steps: [] })
      }
      map.get(key)!.steps.push(step)
    }

    return Array.from(map.entries()).map(([key, val]) => ({
      key,
      name: val.name,
      steps: val.steps,
    }))
  }, [filtered, groupMode, repsMap])

  function toggleExpand(groupKey: string, stepId: string) {
    setExpandedMap((prev) => {
      const next = new Map(prev)
      if (next.get(groupKey) === stepId) {
        next.delete(groupKey)
      } else {
        next.set(groupKey, stepId)
      }
      return next
    })
  }

  function getRepName(repId: number | null): string {
    if (repId == null) return '—'
    return repsMap.get(repId) ?? '—'
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1
        className="font-sans text-[24px] font-semibold text-[#1A1A1A] mb-6"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Insights
      </h1>

      {/* Ask Beacon — prominent panel */}
      <div style={{ marginBottom: '24px' }}>
        <AskBeacon page="insights" dataContext={askBeaconContext} variant="panel" />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
        <TimeFilter value={timeFilter} onChange={setTimeFilter} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              className="font-mono text-[11px] uppercase text-[#A3A3A3]"
              style={{ letterSpacing: '0.08em', marginRight: '4px' }}
            >
              Severity
            </span>
            {(['all', 'high', 'medium', 'low'] as SeverityFilter[]).map((v) => (
              <button
                key={v}
                onClick={() => setSeverityFilter(v)}
                style={toggleStyle(severityFilter === v)}
              >
                {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '16px', background: '#E5E5E5' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              className="font-mono text-[11px] uppercase text-[#A3A3A3]"
              style={{ letterSpacing: '0.08em', marginRight: '4px' }}
            >
              Type
            </span>
            <button
              onClick={() => setTypeFilter('all')}
              style={toggleStyle(typeFilter === 'all')}
            >
              All
            </button>
            {distinctStepTypes.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                style={toggleStyle(typeFilter === t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '16px', background: '#E5E5E5' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              className="font-mono text-[11px] uppercase text-[#A3A3A3]"
              style={{ letterSpacing: '0.08em', marginRight: '4px' }}
            >
              Flag
            </span>
            <button
              onClick={() => setFlagTypeFilter('all')}
              style={toggleStyle(flagTypeFilter === 'all')}
            >
              All
            </button>
            {distinctFlagTypes.map((f) => (
              <button
                key={f}
                onClick={() => setFlagTypeFilter(f)}
                style={toggleStyle(flagTypeFilter === f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            className="font-mono text-[11px] uppercase text-[#A3A3A3]"
            style={{ letterSpacing: '0.08em', marginRight: '4px' }}
          >
            Group
          </span>
          {([
            { value: 'rep' as GroupMode, label: 'By Rep' },
            { value: 'sequence' as GroupMode, label: 'By Sequence' },
            { value: 'flat' as GroupMode, label: 'Flat' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setGroupMode(value)}
              style={toggleStyle(groupMode === value)}
            >
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

      {!loading && !error && filtered.length === 0 && (
        <p className="font-sans text-[17px] text-[#737373] py-8 text-center">
          No flagged steps match the current filters.
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="border-2 border-[#1A1A1A] rounded-lg overflow-hidden">
          {grouped.map((group) => (
            <div key={group.key}>
              {groupMode !== 'flat' && (
                <GroupHeader
                  name={group.name}
                  count={group.steps.length}
                  worstReplyRate={
                    group.steps.reduce<number | null>((worst, s) => {
                      if (s.reply_rate == null) return worst
                      if (worst == null) return s.reply_rate
                      return s.reply_rate < worst ? s.reply_rate : worst
                    }, null)
                  }
                />
              )}
              {group.steps.map((step) => (
                <StepCard
                  key={step.step_id}
                  step={step}
                  expanded={expandedMap.get(group.key) === step.step_id}
                  onToggle={() => toggleExpand(group.key, step.step_id)}
                  groupMode={groupMode}
                  repName={getRepName(step.rep_id)}
                  onViewRewrite={openDrawer}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
