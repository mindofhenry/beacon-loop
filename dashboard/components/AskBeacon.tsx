'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Copy, Check, RotateCcw, Loader2, Sparkles } from 'lucide-react'
import { useRole, type Role } from '@/context/RoleContext'
import BeaconChart, { type ChartSpec } from './BeaconChart'

// --- Guided prompts by page and role ---

type PageKey = 'insights' | 'overview' | 'reps' | 'sequences'

const GUIDED_PROMPTS: Record<PageKey, Record<Role, string[]>> = {
  insights: {
    manager: [
      'Which rep has the most flagged steps?',
      'What messaging themes are underperforming?',
      'Show me reply rate trends for the last 90 days',
    ],
    revops: [
      'Which sequences generated the most pipeline?',
      'Give me a QBR summary of sequence performance',
      'Compare messaging theme effectiveness across personas',
    ],
    rep: [
      "What's my worst-performing step right now?",
      'Why was this step flagged?',
      'How do my reply rates compare to the team average?',
    ],
  },
  overview: {
    manager: [
      'Summarize what changed since last Monday',
      'Give me a QBR update on sequence health',
      'Which reps need coaching this week?',
    ],
    revops: [
      'Give me a one-paragraph QBR update',
      'What messaging themes drive the most pipeline?',
      'Show me org-wide reply rate trends',
    ],
    rep: [
      "What's my top performing sequence?",
      'How do my rates compare to the team?',
      'Which of my steps need attention?',
    ],
  },
  reps: {
    manager: [
      'Rank my reps by improvement over 30 days',
      'Who needs the most coaching right now?',
      'Compare rep performance by messaging theme',
    ],
    revops: [
      'Which reps generate the most pipeline?',
      'Show me team performance breakdown',
      'Who has the highest meeting conversion?',
    ],
    rep: [
      'How am I performing vs. the team average?',
      'What are my strongest sequences?',
      'Where should I focus this week?',
    ],
  },
  sequences: {
    manager: [
      'Which sequences should we retire?',
      'Compare top vs bottom sequences',
      'What step types have the highest reply rates?',
    ],
    revops: [
      'Which sequences should we retire?',
      'Compare top vs bottom sequences by pipeline',
      'Show me sequence health distribution',
    ],
    rep: [
      'Which of my sequences is performing best?',
      'What step types get the most replies?',
      "Show me my sequences' reply rate trends",
    ],
  },
}

// --- Types ---

type AskBeaconProps = {
  page: PageKey
  dataContext?: string
  variant?: 'panel' | 'modal'
}

// --- Component ---

export default function AskBeacon({ page, dataContext, variant = 'panel' }: AskBeaconProps) {
  const { role } = useRole()
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [chartSpec, setChartSpec] = useState<ChartSpec | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const responseRef = useRef<HTMLDivElement>(null)

  const prompts = GUIDED_PROMPTS[page]?.[role] ?? GUIDED_PROMPTS.insights.manager

  const submit = useCallback(
    async (question: string) => {
      if (!question.trim() || isStreaming) return

      // Reset state
      setResponseText('')
      setChartSpec(null)
      setError(null)
      setIsStreaming(true)
      setCopied(false)

      // Abort any in-flight request
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/ask-beacon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: question,
            context: dataContext,
            stream: true,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Request failed' }))
          setError(err.error ?? `Error ${res.status}`)
          setIsStreaming(false)
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          setError('No response stream')
          setIsStreaming(false)
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let finalText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events from buffer
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // keep incomplete line in buffer

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)
              try {
                const data = JSON.parse(dataStr)

                if (currentEvent === 'text_delta') {
                  finalText += data.text
                  setResponseText(finalText)
                } else if (currentEvent === 'chart_spec') {
                  setChartSpec(data as ChartSpec)
                } else if (currentEvent === 'done') {
                  // done.text has chart_spec tags stripped
                  setResponseText(data.text)
                } else if (currentEvent === 'error') {
                  setError(data.error)
                }
              } catch {
                // skip malformed JSON
              }
              currentEvent = ''
            }
          }

          // Auto-scroll response area
          if (responseRef.current) {
            responseRef.current.scrollTop = responseRef.current.scrollHeight
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message ?? 'Connection failed')
        }
      }

      setIsStreaming(false)
    },
    [dataContext, isStreaming],
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(input)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(responseText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClear() {
    abortRef.current?.abort()
    setInput('')
    setResponseText('')
    setChartSpec(null)
    setError(null)
    setIsStreaming(false)
  }

  const hasResponse = responseText.length > 0 || error

  const isPanel = variant === 'panel'

  return (
    <div
      style={{
        background: isPanel ? '#0c0c0c' : 'transparent',
        border: isPanel ? '1px solid #1c1c1c' : 'none',
        borderRadius: isPanel ? '10px' : '0',
        padding: isPanel ? '20px' : '0',
      }}
    >
      {/* Header */}
      {isPanel && (
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} style={{ color: '#3b82f6' }} />
          <span
            className="font-mono text-[11px] uppercase"
            style={{ letterSpacing: '0.08em', color: '#3a3a3a' }}
          >
            Ask Beacon
          </span>
        </div>
      )}

      {/* Prompt input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#101010',
          border: '1px solid #252525',
          borderRadius: '8px',
          padding: '4px 4px 4px 14px',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your sequence data..."
          disabled={isStreaming}
          className="font-sans text-[15px]"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e5e5e5',
            padding: '8px 0',
          }}
        />
        <button
          onClick={() => submit(input)}
          disabled={!input.trim() || isStreaming}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            border: 'none',
            background: input.trim() && !isStreaming ? '#3b82f6' : '#1c1c1c',
            color: input.trim() && !isStreaming ? '#fff' : '#555',
            cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
            transition: 'background 150ms ease',
            flexShrink: 0,
          }}
        >
          {isStreaming ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>

      {/* Guided prompts */}
      {!hasResponse && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
          {prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                setInput(prompt)
                submit(prompt)
              }}
              disabled={isStreaming}
              className="font-mono text-[12px] transition-all duration-150"
              style={{
                padding: '6px 12px',
                borderRadius: '16px',
                border: '1px solid #252525',
                background: '#111',
                color: '#888',
                cursor: isStreaming ? 'default' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isStreaming) {
                  e.currentTarget.style.borderColor = '#3b82f6'
                  e.currentTarget.style.color = '#ccc'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#252525'
                e.currentTarget.style.color = '#888'
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Response area */}
      {hasResponse && (
        <div style={{ marginTop: '16px' }}>
          {/* Streaming text */}
          <div
            ref={responseRef}
            className="font-sans text-[15px]"
            style={{
              color: '#ccc',
              lineHeight: 1.7,
              maxHeight: variant === 'modal' ? '260px' : '360px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error ? (
              <span style={{ color: '#f87171' }}>Error: {error}</span>
            ) : (
              responseText
            )}
            {isStreaming && (
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '16px',
                  background: '#3b82f6',
                  marginLeft: '2px',
                  verticalAlign: 'text-bottom',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            )}
          </div>

          {/* Chart */}
          {chartSpec && <BeaconChart spec={chartSpec} />}

          {/* Actions */}
          {!isStreaming && responseText && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <button
                onClick={handleCopy}
                className="font-mono text-[12px] flex items-center gap-1.5 transition-colors duration-150"
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid #252525',
                  background: '#111',
                  color: copied ? '#22c55e' : '#888',
                  cursor: 'pointer',
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={handleClear}
                className="font-mono text-[12px] flex items-center gap-1.5 transition-colors duration-150"
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid #252525',
                  background: '#111',
                  color: '#888',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={13} />
                New question
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

export { type PageKey }
