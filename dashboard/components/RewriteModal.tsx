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
      ? { bg: '#DCFCE7', color: '#16A34A', border: '#16A34A' }
      : rewrite?.confidence === 'medium'
        ? { bg: '#FEF3C7', color: '#F59E0B', border: '#F59E0B' }
        : { bg: '#FEE2E2', color: '#DC2626', border: '#DC2626' }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)' }} />

      {/* Modal */}
      <div
        className="relative z-10 w-[90%] max-h-[85vh] overflow-y-auto p-8"
        style={{
          background: '#FFFFFF',
          border: '2px solid #1A1A1A',
          borderRadius: '10px',
          maxWidth: '900px',
          boxShadow: '8px 8px 0px #1A1A1A',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 transition-colors duration-150 cursor-pointer"
          style={{ color: '#A3A3A3' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#525252')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#A3A3A3')}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-sans text-[17px] text-[#525252]">
              {sequenceName} — Step {stepNumber}
            </span>
            <span
              className="font-mono text-[13px] rounded px-2 py-0.5"
              style={{
                background: '#FEE2E2',
                color: '#DC2626',
                border: '1px solid #DC2626',
              }}
            >
              {(healthScore * 100).toFixed(0)}
            </span>
          </div>
          <span className="font-mono text-[13px] text-[#A3A3A3]">
            {stepType}
          </span>
        </div>

        {loading ? (
          <div className="space-y-4 py-4">
            <div className="h-4 bg-[#E5E5E5] rounded animate-pulse w-3/4" />
            <div className="grid grid-cols-2 gap-6">
              <div className="h-48 bg-[#E5E5E5] rounded-lg animate-pulse" />
              <div className="h-48 bg-[#E5E5E5] rounded-lg animate-pulse" />
            </div>
            <div className="h-16 bg-[#E5E5E5] rounded-lg animate-pulse" />
          </div>
        ) : !rewrite ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="font-mono text-[13px] text-[#A3A3A3]">
              no rewrite suggestion exists for this step yet.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-50 font-mono text-[13px] rounded-md px-4 py-1.5"
              style={{
                background: '#DBEAFE',
                border: '2px solid #2563EB',
                color: '#2563EB',
                boxShadow: '4px 4px 0px #2563EB',
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
                  className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-3"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Current
                </p>
                <div className="mb-3">
                  <p
                    className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-1.5"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Subject
                  </p>
                  <div
                    className="font-sans text-[15px] italic rounded-md p-3"
                    style={{
                      background: '#FEE2E2',
                      border: '1px solid #E5E5E5',
                      color: '#525252',
                      minHeight: '40px',
                    }}
                  >
                    {currentSubject ?? rewrite?.current_subject ?? '—'}
                  </div>
                </div>
                <div>
                  <p
                    className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-1.5"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Body
                  </p>
                  <div
                    className="font-sans text-[15px] italic rounded-md p-3 whitespace-pre-wrap overflow-y-auto"
                    style={{
                      background: '#FEE2E2',
                      border: '1px solid #E5E5E5',
                      color: '#525252',
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
                  className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-3"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Suggested
                </p>
                <div className="mb-3">
                  <p
                    className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-1.5"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Subject
                  </p>
                  <div
                    className="font-sans text-[15px] rounded-md p-3"
                    style={{
                      background: '#DCFCE7',
                      border: '2px solid #16A34A',
                      color: '#525252',
                      minHeight: '40px',
                    }}
                  >
                    {rewrite.suggested_subject}
                  </div>
                </div>
                <div>
                  <p
                    className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-1.5"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    Body
                  </p>
                  <div
                    className="font-sans text-[15px] rounded-md p-3 whitespace-pre-wrap overflow-y-auto"
                    style={{
                      background: '#DCFCE7',
                      border: '2px solid #16A34A',
                      color: '#525252',
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
                className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-2"
                style={{ letterSpacing: '0.08em' }}
              >
                Diagnosis
              </p>
              <p className="font-sans text-[17px] text-[#525252] leading-relaxed">
                {rewrite.diagnosis}
              </p>
            </div>

            {/* Why This Works */}
            {rewrite.explanation && (
              <div
                className="mb-6 p-4 rounded-md"
                style={{
                  background: '#F5F5F5',
                  border: '2px solid #D4D4D4',
                }}
              >
                <p
                  className="font-mono text-[11px] uppercase text-[#A3A3A3] mb-2"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Why This Works
                </p>
                <p className="font-sans text-[17px] text-[#525252] leading-relaxed">
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
                  background: '#DBEAFE',
                  border: '2px solid #2563EB',
                  color: '#2563EB',
                  boxShadow: '4px 4px 0px #2563EB',
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
