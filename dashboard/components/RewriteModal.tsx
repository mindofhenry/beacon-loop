'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, RefreshCw, Loader2 } from 'lucide-react'

type RewriteData = {
  id: string
  step_id: string
  sequence_name: string
  step_number: number
  diagnosis: string
  suggested_subject: string
  suggested_body: string
  confidence: string | null
  explanation: string | null
  current_subject: string | null
  current_body: string | null
}

type Props = {
  stepId: string
  stepNumber: number
  stepType: string
  sequenceName: string
  currentSubject: string | null
  currentBody: string | null
  healthScore: number
  personaConfigId: string
  onClose: () => void
}

export default function RewriteModal({
  stepId,
  stepNumber,
  stepType,
  sequenceName,
  currentSubject,
  currentBody,
  healthScore,
  personaConfigId,
  onClose,
}: Props) {
  const [rewrite, setRewrite] = useState<RewriteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const fetchRewrite = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/rewrites/${stepId}`)
    const json = await res.json()
    setRewrite(json.data ?? null)
    setLoading(false)
  }, [stepId])

  useEffect(() => {
    fetchRewrite()
  }, [fetchRewrite])

  async function handleGenerate() {
    setGenerating(true)
    const res = await fetch('/api/rewrites/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepId, personaConfigId }),
    })
    const json = await res.json()
    if (json.data) setRewrite(json.data)
    setGenerating(false)
  }

  const confidenceColor =
    rewrite?.confidence === 'high'
      ? { bg: '#052010', color: '#4ade80', border: '#0d3d1c' }
      : rewrite?.confidence === 'medium'
        ? { bg: '#1a1200', color: '#fbbf24', border: '#332400' }
        : { bg: '#1a0505', color: '#f87171', border: '#331010' }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)' }} />

      {/* Modal */}
      <div
        className="relative z-10 w-[90%] max-h-[85vh] overflow-y-auto p-8"
        style={{
          background: '#0d0d0d',
          border: '1px solid #252525',
          borderRadius: '10px',
          maxWidth: '900px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 transition-colors duration-150 cursor-pointer"
          style={{ color: '#333' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#333')}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-sans text-[17px] text-[#aaa]">
              {sequenceName} — Step {stepNumber}
            </span>
            <span
              className="font-mono text-[13px] rounded px-2 py-0.5"
              style={{
                background: '#1a0505',
                color: '#f87171',
                border: '1px solid #331010',
              }}
            >
              {(healthScore * 100).toFixed(0)}
            </span>
          </div>
          <span className="font-mono text-[13px] text-[#333]">
            {stepType}
          </span>
        </div>

        {loading ? (
          <div className="space-y-4 py-4">
            <div className="h-4 bg-[#1c1c1c] rounded animate-pulse w-3/4" />
            <div className="grid grid-cols-2 gap-6">
              <div className="h-48 bg-[#1c1c1c] rounded-lg animate-pulse" />
              <div className="h-48 bg-[#1c1c1c] rounded-lg animate-pulse" />
            </div>
            <div className="h-16 bg-[#1c1c1c] rounded-lg animate-pulse" />
          </div>
        ) : !rewrite ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="font-mono text-[13px] text-[#333]">
              no rewrite suggestion exists for this step yet.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-50 font-mono text-[13px] rounded-md px-4 py-1.5"
              style={{
                background: '#0f1729',
                border: '1px solid #1e3a5f',
                color: '#3b82f6',
              }}
            >
              {generating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {generating ? 'generating...' : 'generate rewrite'}
            </button>
          </div>
        ) : (
          <>
            {/* Two-column layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Current */}
              <div>
                <p
                  className="font-mono text-[11px] uppercase text-[#333] mb-3"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Current
                </p>
                <div className="mb-3">
                  <p
                    className="font-mono text-[11px] uppercase text-[#333] mb-1.5"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Subject
                  </p>
                  <div
                    className="font-sans text-[15px] italic rounded-md p-3"
                    style={{
                      background: '#0a0a0a',
                      border: '1px solid #1a1a1a',
                      color: '#888',
                      minHeight: '40px',
                    }}
                  >
                    {currentSubject ?? rewrite?.current_subject ?? '—'}
                  </div>
                </div>
                <div>
                  <p
                    className="font-mono text-[11px] uppercase text-[#333] mb-1.5"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Body
                  </p>
                  <div
                    className="font-sans text-[15px] italic rounded-md p-3 whitespace-pre-wrap overflow-y-auto"
                    style={{
                      background: '#0a0a0a',
                      border: '1px solid #1a1a1a',
                      color: '#888',
                      minHeight: '120px',
                      maxHeight: '250px',
                    }}
                  >
                    {currentBody ?? rewrite?.current_body ?? '—'}
                  </div>
                </div>
              </div>

              {/* Suggested */}
              <div>
                <p
                  className="font-mono text-[11px] uppercase text-[#333] mb-3"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Suggested
                </p>
                <div className="mb-3">
                  <p
                    className="font-mono text-[11px] uppercase text-[#333] mb-1.5"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Subject
                  </p>
                  <div
                    className="font-sans text-[15px] rounded-md p-3"
                    style={{
                      background: '#03100a',
                      border: '1px solid #0d3020',
                      color: '#aaa',
                      minHeight: '40px',
                    }}
                  >
                    {rewrite.suggested_subject}
                  </div>
                </div>
                <div>
                  <p
                    className="font-mono text-[11px] uppercase text-[#333] mb-1.5"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Body
                  </p>
                  <div
                    className="font-sans text-[15px] rounded-md p-3 whitespace-pre-wrap overflow-y-auto"
                    style={{
                      background: '#03100a',
                      border: '1px solid #0d3020',
                      color: '#aaa',
                      minHeight: '120px',
                      maxHeight: '250px',
                    }}
                  >
                    {rewrite.suggested_body}
                  </div>
                </div>
              </div>
            </div>

            {/* Confidence badge */}
            <div className="mb-4">
              <span
                className="font-mono text-[13px] rounded px-2 py-0.5"
                style={{
                  background: confidenceColor.bg,
                  color: confidenceColor.color,
                  border: `1px solid ${confidenceColor.border}`,
                }}
              >
                {(rewrite.confidence ?? 'medium').toUpperCase()}
              </span>
            </div>

            {/* Diagnosis */}
            <div className="mb-4">
              <p
                className="font-mono text-[11px] uppercase text-[#333] mb-2"
                style={{ letterSpacing: '0.08em' }}
              >
                Diagnosis
              </p>
              <p className="font-sans text-[17px] text-[#aaa] leading-relaxed">
                {rewrite.diagnosis}
              </p>
            </div>

            {/* Why This Works */}
            {rewrite.explanation && (
              <div
                className="mb-6 p-4 rounded-md"
                style={{
                  background: '#0f0f0f',
                  border: '1px solid #1c1c1c',
                }}
              >
                <p
                  className="font-mono text-[11px] uppercase text-[#333] mb-2"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Why This Works
                </p>
                <p className="font-sans text-[17px] text-[#888] leading-relaxed">
                  {rewrite.explanation}
                </p>
              </div>
            )}

            {/* Regenerate button */}
            <div className="flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-50 font-mono text-[13px] rounded-md px-4 py-1.5"
                style={{
                  background: '#0f1729',
                  border: '1px solid #1e3a5f',
                  color: '#3b82f6',
                }}
              >
                {generating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {generating ? 'generating...' : 'regenerate'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
