import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auditProof } from '@/ai/flows/audit-proof-flow';

// The free-tier vision models this flow calls can be slow under load;
// give them more room than the platform's 10s default so a slow-but-alive
// call doesn't get killed by the platform before our own fallback can run.
export const maxDuration = 30;

/**
 * POST /api/audit-proof
 *
 * Triggers the AI audit flow on an uploaded agent proof image.
 * Updates the agent_daily_logs record with the AI verdict.
 *
 * Body: { logId: string, photoUrl: string, taskType: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { logId, photoUrl, taskType } = await req.json();

    if (!logId || !photoUrl || !taskType) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const supabase = await createClient();

    // Confirm the log exists
    const { data: log, error: logError } = await supabase
      .from('agent_daily_logs')
      .select('id, user_id')
      .eq('id', logId)
      .single();

    if (logError || !log) {
      return NextResponse.json({ error: 'Log record not found.' }, { status: 404 });
    }

    // Run the AI audit
    const result = await auditProof({ photoUrl, taskType });

    // Update the log with the AI verdict
    const { error: updateError } = await supabase
      .from('agent_daily_logs')
      .update({
        status: result.verdict,
        ai_feedback: result.feedback,
      })
      .eq('id', logId);

    if (updateError) {
      console.error('Failed to update log with AI verdict:', updateError);
      return NextResponse.json({ error: 'Failed to save audit result.' }, { status: 500 });
    }

    return NextResponse.json({
      verdict: result.verdict,
      feedback: result.feedback,
      confidence: result.confidence,
      isFacebookScreenshot: result.isFacebookScreenshot,
      matchesTaskType: result.matchesTaskType,
    });
  } catch (err) {
    console.error('Audit proof API error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
