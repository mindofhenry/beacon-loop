'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
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
  subLabel,
}: {
  label: string
  value: string
  subLabel: string
}) {
  return (
    <div
      style={{
        background: '#0f0f0f',
        border: '1px solid #1c1c1c',
        borderRadius: '7px',
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '9px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#3a3a3a',
          marginBottom: '5px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '22px',
          fontWeight: 500,
          color: '#e5e5e5',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '9px',
          color: '#333',
          marginTop: '3px',
        }}
      >
        {subLabel}
      </div>
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
      {/* Page title */}
      <p
        style={{
          fontFamily: 'IBM Plex Sans, sans-serif',
          fontSize: '13px',
          fontWeight: 400,
          color: '#aaa',
          letterSpacing: '0.04em',
          textTransform: 'lowercase',
          marginBottom: '16px',
        }}
      >
        org health
      </p>
      <div className="border-b border-[#1c1c1c] mb-6" />

      {/* Stat cards */}
      {loadingSeqs ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-[#1c1c1c] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Active Sequences"
            value={String(activeCount)}
            subLabel="outreach + salesloft"
          />
          <StatCard
            label="Org Avg Reply Rate"
            value={`${(avgReply * 100).toFixed(1)}%`}
            subLabel="reply / sends"
          />
          <StatCard
            label="Total Pipeline Influenced"
            value={`$${totalPipeline >= 1_000_000 ? `${(totalPipeline / 1_000_000).toFixed(1)}M` : totalPipeline.toLocaleString()}`}
            subLabel="u-shaped attribution"
          />
          <StatCard
            label="Flagged Steps"
            value={String(flaggedCount)}
            subLabel="below threshold"
          />
        </div>
      )}

      {/* Org Intelligence panel */}
      <div
        style={{
          background: '#0f0f0f',
          border: '1px solid #1c1c1c',
          borderRadius: '7px',
          padding: '14px 18px',
          marginBottom: '24px',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '9px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#333',
            }}
          >
            org intelligence
          </span>
          <button
            onClick={() => fetchSummary(true)}
            disabled={loadingSummary}
            className="flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
            style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px', color: '#555' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#888' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#555' }}
          >
            {loadingSummary ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            refresh
          </button>
        </div>
        {loadingSummary ? (
          <div className="space-y-2">
            <div className="h-3 bg-[#1c1c1c] rounded animate-pulse w-full" />
            <div className="h-3 bg-[#1c1c1c] rounded animate-pulse w-3/4" />
          </div>
        ) : (
          <p
            style={{
              fontFamily: 'IBM Plex Sans, sans-serif',
              fontSize: '12px',
              color: '#888',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {summary?.summary_text ?? 'No summary available.'}
          </p>
        )}
      </div>

      {/* Health bar chart */}
      {loadingSeqs ? (
        <div className="h-[300px] w-full bg-[#1c1c1c] rounded-lg animate-pulse" />
      ) : chartData.length > 0 ? (
        <div>
          <p
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '9px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#333',
              marginBottom: '12px',
            }}
          >
            sequence health scores
          </p>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: '#555', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                axisLine={{ stroke: '#1c1c1c' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={180}
                tick={{ fill: '#555', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                axisLine={{ stroke: '#1c1c1c' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111111',
                  border: '1px solid #1c1c1c',
                  borderRadius: '8px',
                  fontFamily: 'IBM Plex Sans',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#f1f5f9', fontFamily: 'IBM Plex Mono' }}
                formatter={(value, _name, props) => {
                  const p = props?.payload as { flagged?: number; fullName?: string } | undefined
                  return [`Score: ${value} | Flagged: ${p?.flagged ?? 0}`, p?.fullName ?? '']
                }}
              />
              <ReferenceLine
                x={50}
                stroke="#F59E0B"
                strokeDasharray="4 4"
                label={{ value: 'Yellow', fill: '#F59E0B', fontSize: 10, fontFamily: 'IBM Plex Mono', position: 'top' }}
              />
              <ReferenceLine
                x={70}
                stroke="#22c55e"
                strokeDasharray="4 4"
                label={{ value: 'Green', fill: '#22c55e', fontSize: 10, fontFamily: 'IBM Plex Mono', position: 'top' }}
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
