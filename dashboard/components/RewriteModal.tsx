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
}

type Props = {
  stepId: string
  stepNumber: number
  stepType: string
  sequenceName: string
  currentSubject: string | null
  currentBody: string | null
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
      ? 'bg-[#22c55e]'
      : rewrite?.confidence === 'medium'
        ? 'bg-[#F59E0B]'
        : 'bg-[#ef4444]'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[4px]" />

      {/* Modal */}
      <div
        className="relative z-10 bg-[#111111] border border-[#1f1f1f] rounded-xl max-w-[900px] w-[90%] max-h-[85vh] overflow-y-auto p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors duration-150 cursor-pointer"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="font-mono text-lg text-slate-100">
            {sequenceName} — Step {stepNumber}
          </h2>
          <span className="font-mono text-xs text-slate-400">{stepType}</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm font-sans py-12 justify-center">
            <Loader2 size={16} className="animate-spin" />
            Loading...
          </div>
        ) : !rewrite ? (
          /* No rewrite exists — show generate button */
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-slate-400 font-sans text-sm">
              No rewrite suggestion exists for this step yet.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 bg-[#F59E0B] text-white font-sans font-semibold text-sm px-6 py-3 rounded-lg hover:opacity-90 hover:-translate-y-[1px] transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              {generating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              {generating ? 'Generating...' : 'Generate Rewrite'}
            </button>
          </div>
        ) : (
          <>
            {/* Two-column layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Current */}
              <div>
                <h3 className="font-sans text-xs uppercase tracking-wider text-slate-400 mb-3">
                  Current
                </h3>
                <div className="mb-3">
                  <label className="font-sans text-xs text-slate-500 mb-1 block">
                    Subject
                  </label>
                  <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-3 font-mono text-sm text-slate-300 min-h-[40px]">
                    {currentSubject || '—'}
                  </div>
                </div>
                <div>
                  <label className="font-sans text-xs text-slate-500 mb-1 block">
                    Body
                  </label>
                  <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-3 font-mono text-sm text-slate-300 min-h-[120px] max-h-[250px] overflow-y-auto whitespace-pre-wrap">
                    {currentBody || '—'}
                  </div>
                </div>
              </div>

              {/* Suggested */}
              <div>
                <h3 className="font-sans text-xs uppercase tracking-wider text-[#F59E0B] mb-3">
                  Suggested
                </h3>
                <div className="mb-3">
                  <label className="font-sans text-xs text-slate-500 mb-1 block">
                    Subject
                  </label>
                  <div className="bg-[#0a0a0a] border-l-2 border-[#F59E0B] border-r border-t border-b border-r-[#1f1f1f] border-t-[#1f1f1f] border-b-[#1f1f1f] rounded-lg p-3 font-mono text-sm text-slate-100 min-h-[40px]">
                    {rewrite.suggested_subject}
                  </div>
                </div>
                <div>
                  <label className="font-sans text-xs text-slate-500 mb-1 block">
                    Body
                  </label>
                  <div className="bg-[#0a0a0a] border-l-2 border-[#F59E0B] border-r border-t border-b border-r-[#1f1f1f] border-t-[#1f1f1f] border-b-[#1f1f1f] rounded-lg p-3 font-mono text-sm text-slate-100 min-h-[120px] max-h-[250px] overflow-y-auto whitespace-pre-wrap">
                    {rewrite.suggested_body}
                  </div>
                </div>
              </div>
            </div>

            {/* Confidence badge */}
            <div className="mb-4">
              <span
                className={`inline-block font-mono text-xs text-white px-3 py-1 rounded-full ${confidenceColor}`}
              >
                {(rewrite.confidence ?? 'medium').toUpperCase()}
              </span>
            </div>

            {/* Diagnosis */}
            <div className="mb-4">
              <h4 className="font-sans text-xs text-slate-400 mb-2">Diagnosis</h4>
              <p className="font-sans text-sm text-slate-200 leading-relaxed">
                {rewrite.diagnosis}
              </p>
            </div>

            {/* Explanation */}
            {rewrite.explanation && (
              <div className="mb-6 bg-[#0f1a2e] border-l-3 border-[#1E40AF] rounded-r-lg p-4">
                <h4 className="font-sans text-xs text-[#F59E0B] mb-2">
                  Why This Works
                </h4>
                <p className="font-sans text-sm text-slate-200 leading-relaxed">
                  {rewrite.explanation}
                </p>
              </div>
            )}

            {/* Regenerate button */}
            <div className="flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 bg-[#F59E0B] text-white font-sans font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 hover:-translate-y-[1px] transition-all duration-200 cursor-pointer disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                {generating ? 'Generating...' : 'Regenerate'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
