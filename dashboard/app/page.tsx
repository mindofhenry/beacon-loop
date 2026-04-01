'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Loader2, Activity, Mail, DollarSign, AlertTriangle } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import SequenceSlideOut from '@/components/SequenceSlideOut'

type Sequence = {
  id: string
  name: string
  source: string
  status: string
  healthScore: number
  tier: 'green' | 'yellow' | 'red'
  flaggedStepCount: number
  stepCount: number
}

type OrgSummary = {
  summary_text: string
  data_snapshot: {
    activeSequenceCount: number
    orgAvgReplyRate: number
    totalPipelineValue: number
    flaggedStepCount: number
  }
}

const tierFill = { green: '#22c55e', yellow: '#F59E0B', red: '#ef4444' }

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-slate-500" />
        <span className="font-sans text-xs text-slate-400">{label}</span>
      </div>
      <span className="font-mono text-2xl text-slate-100">{value}</span>
    </div>
  )
}

export default function OrgHealthPage() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [summary, setSummary] = useState<OrgSummary | null>(null)
  const [loadingSeqs, setLoadingSeqs] = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [personaConfigId, setPersonaConfigId] = useState<string>('')

  const fetchSequences = useCallback(async () => {
    setLoadingSeqs(true)
    const res = await fetch('/api/sequences')
    const json = await res.json()
    setSequences(json.data ?? [])
    setLoadingSeqs(false)
  }, [])

  const fetchSummary = useCallback(async (force = false) => {
    setLoadingSummary(true)
    const url = `/api/org/summary${force ? '?force=true' : ''}`
    const res = await fetch(url)
    const json = await res.json()
    setSummary(json.data ?? null)
    setLoadingSummary(false)
  }, [])

  // Fetch persona config id once
  useEffect(() => {
    fetch('/api/sequences').then(() => {
      // persona config is fetched by the rewrite generate endpoint
      // but we need the ID for the slide-out → modal chain
      // Use a simple fetch to get it
      fetch('/api/rewrites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: '__probe__' }),
      }).catch(() => {})
    })
    // For now we'll pass empty string and let the API default to first persona
  }, [])

  useEffect(() => {
    fetchSequences()
    fetchSummary()
  }, [fetchSequences, fetchSummary])

  // Stats from summary snapshot
  const snap = summary?.data_snapshot
  const activeCount = snap?.activeSequenceCount ?? sequences.length
  const avgReply = snap?.orgAvgReplyRate ?? 0
  const totalPipeline = snap?.totalPipelineValue ?? 0
  const flaggedCount = snap?.flaggedStepCount ?? 0

  // Chart data — sorted worst first (already from API)
  const chartData = sequences.map((s) => ({
    name: s.name.length > 24 ? s.name.slice(0, 24) + '...' : s.name,
    fullName: s.name,
    score: Math.round(s.healthScore * 100),
    tier: s.tier,
    flagged: s.flaggedStepCount,
    id: s.id,
  }))

  const chartHeight = Math.max(300, chartData.length * 50)

  const selectedSeq = sequences.find((s) => s.id === selectedId)

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="font-mono text-xl font-semibold text-slate-100 mb-6">
        Org Health Overview
      </h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Active Sequences"
          value={String(activeCount)}
          icon={Activity}
        />
        <StatCard
          label="Org Avg Reply Rate"
          value={`${(avgReply * 100).toFixed(1)}%`}
          icon={Mail}
        />
        <StatCard
          label="Total Pipeline Influenced"
          value={`$${totalPipeline >= 1_000_000 ? `${(totalPipeline / 1_000_000).toFixed(1)}M` : totalPipeline.toLocaleString()}`}
          icon={DollarSign}
        />
        <StatCard
          label="Flagged Steps"
          value={String(flaggedCount)}
          icon={AlertTriangle}
        />
      </div>

      {/* Claude org summary */}
      <div className="bg-[#0f1a2e] border-l-3 border-[#1E40AF] rounded-r-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="font-sans text-xs text-[#3B82F6]">
            Org Intelligence
          </span>
          <button
            onClick={() => fetchSummary(true)}
            disabled={loadingSummary}
            className="flex items-center gap-1.5 text-[#F59E0B] font-sans text-xs hover:opacity-80 transition-opacity duration-150 cursor-pointer"
          >
            {loadingSummary ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Refresh
          </button>
        </div>
        {loadingSummary ? (
          <div className="space-y-2">
            <div className="h-3 bg-slate-700/50 rounded animate-pulse w-full" />
            <div className="h-3 bg-slate-700/50 rounded animate-pulse w-3/4" />
          </div>
        ) : (
          <p className="font-sans text-sm text-slate-200 leading-relaxed">
            {summary?.summary_text ?? 'No summary available.'}
          </p>
        )}
      </div>

      {/* Health bar chart */}
      {loadingSeqs ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm font-sans py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Loading sequences...
        </div>
      ) : chartData.length > 0 ? (
        <div>
          <h2 className="font-sans text-xs text-slate-400 mb-3">
            Sequence Health Scores
          </h2>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Fira Code' }}
                axisLine={{ stroke: '#1f1f1f' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={180}
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Fira Sans' }}
                axisLine={{ stroke: '#1f1f1f' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111111',
                  border: '1px solid #1f1f1f',
                  borderRadius: '8px',
                  fontFamily: 'Fira Sans',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#f1f5f9', fontFamily: 'Fira Code' }}
                formatter={(value, _name, props) => {
                  const p = props?.payload as { flagged?: number; fullName?: string } | undefined
                  return [`Score: ${value} | Flagged: ${p?.flagged ?? 0}`, p?.fullName ?? '']
                }}
              />
              <ReferenceLine
                x={50}
                stroke="#F59E0B"
                strokeDasharray="4 4"
                label={{ value: 'Yellow', fill: '#F59E0B', fontSize: 10, fontFamily: 'Fira Sans', position: 'top' }}
              />
              <ReferenceLine
                x={70}
                stroke="#22c55e"
                strokeDasharray="4 4"
                label={{ value: 'Green', fill: '#22c55e', fontSize: 10, fontFamily: 'Fira Sans', position: 'top' }}
              />
              <Bar
                dataKey="score"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(_data: unknown, index: number) => {
                  setSelectedId(chartData[index].id)
                }}
              >
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={tierFill[entry.tier]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-slate-400 font-sans text-sm">No sequence data found.</p>
      )}

      {/* Sequence slide-out */}
      {selectedId && selectedSeq && (
        <SequenceSlideOut
          sequenceId={selectedId}
          healthScore={selectedSeq.healthScore}
          tier={selectedSeq.tier}
          personaConfigId={personaConfigId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
