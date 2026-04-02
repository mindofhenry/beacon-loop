import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  const { stepId } = await params

  const { data, error } = await supabaseServer
    .from('rewrite_suggestions')
    .select('*')
    .eq('step_id', stepId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows — that's fine, return null
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch current subject + body from sequence_steps so callers have the "before" copy
  const { data: stepCopy } = await supabaseServer
    .from('sequence_steps')
    .select('subject, body_text')
    .eq('step_id', stepId)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    data: data
      ? { ...data, current_subject: stepCopy?.subject ?? null, current_body: stepCopy?.body_text ?? null }
      : null,
  })
}
