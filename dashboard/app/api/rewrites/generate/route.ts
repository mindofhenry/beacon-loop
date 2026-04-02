import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

/**
 * TypeScript port of the canonical prompt in prompts/rewrite.py.
 * If the prompt changes, update BOTH this file and prompts/rewrite.py.
 */
function buildRewritePrompt(step: Record<string, unknown>, persona: Record<string, unknown>): string {
  const painPoints = Array.isArray(persona.pain_points)
    ? (persona.pain_points as string[]).join(', ')
    : ''
  const flagReasons = Array.isArray(step.flag_reasons)
    ? (step.flag_reasons as string[]).join('\n  - ')
    : step.flag_type && step.flag_type !== 'none'
      ? `${step.flag_type} (confidence: ${Number(step.flag_confidence ?? 0).toFixed(2)})`
      : 'health score below threshold'

  const extraCtx = persona.extra_context
    ? `\n- Additional context: ${persona.extra_context}`
    : ''

  return `You are an expert B2B sales email copywriter analyzing an underperforming outbound sequence step.

## Step Metrics
- Source: ${step.source}
- Sequence: ${step.sequence_name} (ID: ${step.sequence_id})
- Step: #${step.step_number} (${step.step_type})
- Send volume: ${step.send_volume}
- Open rate: ${(Number(step.open_rate) * 100).toFixed(1)}%
- Reply rate: ${(Number(step.reply_rate) * 100).toFixed(1)}%
- Meeting rate: ${(Number(step.meeting_rate) * 100).toFixed(1)}%
- Health score: ${Number(step.health_score_v2).toFixed(3)} / 1.000
- Step intent: ${step.step_intent ?? 'unknown'}
- Position expected rate: ${step.position_expected_rate != null ? (Number(step.position_expected_rate) * 100).toFixed(2) + '%' : 'N/A'}
- Bayesian reply rate: ${step.bayesian_reply_rate != null ? (Number(step.bayesian_reply_rate) * 100).toFixed(2) + '%' : 'N/A'}
- Flag type: ${step.flag_type ?? 'none'}

## Why It's Flagged
  - ${flagReasons}

## Target Persona
- Title: ${persona.title ?? 'unknown'}
- Industry: ${persona.industry ?? 'unknown'}
- Company size: ${persona.company_size ?? 'unknown'}
- Pain points: ${painPoints}
- Tone: ${persona.tone ?? 'professional'}${extraCtx}

## Selling Methodology — Apply ALL Five Principles

### 1. Sell to Pain
Name the specific operational or business pain this persona experiences given their title, industry, and company stage. Do NOT pitch features. Start from their problem, not the product.

### 2. Value-Based Framing
Lead with what changes for the prospect as an outcome, not what the product does. Frame every benefit as a result they achieve.

### 3. Why You (Relevance)
Make relevance to this specific persona and company context explicit. Use the title "${persona.title ?? 'unknown'}" at a ${persona.company_size ?? 'unknown'} ${persona.industry ?? 'unknown'} company to ground the copy in their world. Reference challenges specific to their role and scale.

### 4. Why Now (Timing)
Anchor to a timely reason to act. Based on the persona's industry (${persona.industry ?? 'unknown'}), role (${persona.title ?? 'unknown'}), and company size (${persona.company_size ?? 'unknown'}), infer the most relevant timing signal — e.g. budget cycles, quarterly planning, hiring surges, regulatory deadlines, competitive pressure, or seasonal patterns.

### 5. Anti-Template Test
If the subject line or opening line could apply to 1,000 companies without changing a word, it fails. Rewrite until it can't. Every line must feel written for THIS persona at THIS type of company.

## Your Task
Respond with a JSON object containing exactly these five keys:

1. "diagnosis": 2-3 sentences explaining why this step is underperforming based on the metrics and persona fit. Be specific about which selling principle the current copy violates.

2. "suggested_subject": A single revised subject line optimized for this persona. Must pass the anti-template test.

3. "suggested_body": A revised email body (plain text, 3-5 sentences, no placeholders except {{first_name}} and {{company}}). Must lead with pain, frame value as outcomes, and include a timing hook.

4. "confidence": One of "low", "medium", or "high". Base this on how much data you have to work with — "high" when metrics clearly point to a fixable issue and the persona context is rich, "low" when data is sparse or the problem is ambiguous.

5. "explanation": Bullet points only. Maximum 3 bullets. Each bullet is one sentence. No prose paragraphs. Written for a rep.

Respond with raw JSON only — no markdown fences.`
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { stepId, personaConfigId } = body as { stepId: string; personaConfigId: string }

  if (!stepId) {
    return NextResponse.json({ error: 'stepId is required' }, { status: 400 })
  }

  // Fetch step metrics
  const { data: step, error: stepErr } = await supabaseServer
    .from('step_performance')
    .select('*')
    .eq('step_id', stepId)
    .limit(1)
    .single()

  if (stepErr || !step) {
    return NextResponse.json({ error: `Step ${stepId} not found` }, { status: 404 })
  }

  // Fetch persona
  let personaQuery = supabaseServer.from('persona_configs').select('*')
  if (personaConfigId) {
    personaQuery = personaQuery.eq('id', personaConfigId)
  } else {
    personaQuery = personaQuery.order('created_at', { ascending: true }).limit(1)
  }
  const { data: persona, error: personaErr } = await personaQuery.single()

  if (personaErr || !persona) {
    return NextResponse.json({ error: 'No persona config found' }, { status: 404 })
  }

  // Build prompt and call Claude
  const prompt = buildRewritePrompt(step, persona)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    parsed = match ? JSON.parse(match[0]) : { raw_response: raw }
  }

  // Persist to rewrite_suggestions
  const { data: inserted, error: insertErr } = await supabaseServer
    .from('rewrite_suggestions')
    .insert({
      step_id: step.step_id,
      sequence_id: step.sequence_id,
      sequence_name: step.sequence_name,
      step_number: step.step_number,
      persona_config_id: persona.id,
      diagnosis: parsed.diagnosis ?? '',
      suggested_subject: parsed.suggested_subject ?? '',
      suggested_body: parsed.suggested_body ?? '',
      confidence: parsed.confidence ?? 'medium',
      explanation: parsed.explanation ?? '',
      model_used: 'claude-sonnet-4-6',
      pipeline_run_id: step.pipeline_run_id,
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ data: inserted })
}
