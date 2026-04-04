import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are Beacon's GTM analytics assistant. You help sales managers, RevOps leads, and SDR reps understand sequence performance, step-level attribution, and messaging effectiveness.

You are grounded in the data context provided with each question. When answering:
- Be specific: name sequences, step numbers, rep names, and metrics.
- Be concise: managers have 15 minutes, not 15 paragraphs.
- Be actionable: every insight should suggest what to do next.
- Use the actual numbers from the data — do not invent metrics.

When your response would benefit from a visualization, include a chart specification in a <chart_spec> XML tag. The chart spec is a JSON object with this schema:
{
  "type": "bar" | "line" | "table",
  "data": [{ ... }],
  "title": "Chart title",
  "xLabel": "optional x-axis label",
  "yLabel": "optional y-axis label"
}

For bar charts, each data item should have a "name" field and a numeric value field.
For line charts, each data item should have an "x" field and a "y" field.
For tables, each data item is a row object with column names as keys.

Only include a chart when it genuinely adds value — not every response needs one.`

function buildUserMessage(prompt: string, context?: string): string {
  return context
    ? `## Data Context\n${context}\n\n## Question\n${prompt}`
    : prompt
}

function parseChartSpec(raw: string): { text: string; chartSpec?: Record<string, unknown> } {
  let text = raw
  let chartSpec: Record<string, unknown> | undefined
  const chartMatch = raw.match(/<chart_spec>([\s\S]*?)<\/chart_spec>/)
  if (chartMatch) {
    text = raw.replace(/<chart_spec>[\s\S]*?<\/chart_spec>/, '').trim()
    try {
      chartSpec = JSON.parse(chartMatch[1].trim())
    } catch {
      // Malformed chart spec — return text only
    }
  }
  return { text, chartSpec }
}

// --- Non-streaming handler ---
async function handleNonStreaming(prompt: string, context?: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const userMessage = buildUserMessage(prompt, context)

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Claude API error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const { text, chartSpec } = parseChartSpec(raw)
  return NextResponse.json({ text, chartSpec })
}

// --- Streaming handler ---
function handleStreaming(prompt: string, context?: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const userMessage = buildUserMessage(prompt, context)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      let accumulated = ''

      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
          stream: true,
        })

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const text = event.delta.text
            accumulated += text
            send('text_delta', { text })
          }
        }

        // Parse chart spec from accumulated text
        const { text, chartSpec } = parseChartSpec(accumulated)
        if (chartSpec) {
          send('chart_spec', chartSpec)
        }
        send('done', { text })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Claude API error'
        send('error', { error: msg })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

export async function POST(request: NextRequest) {
  let body: { prompt?: string; context?: string; stream?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { prompt, context, stream: useStreaming } = body
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  if (useStreaming) {
    return handleStreaming(prompt, context)
  }

  return handleNonStreaming(prompt, context)
}
