import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  deleteCopilotAlias,
  deleteCopilotLesson,
  toggleCopilotLesson,
  updateCopilotRule,
  upsertManualAlias,
} from '@/lib/services/messenger-ai/messenger-learning-service';
import { getTaskCaller } from '@/lib/services/staff-tasks/task-caller';
import type { MessengerAiActionType } from '@/types';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(req: Request) {
  try {
    const caller = await getTaskCaller();
    if (!caller?.isManagement) {
      return NextResponse.json({ error: 'Only owners/admins can update Copilot rules.' }, { status: 403 });
    }

    const body = (await req.json()) as {
      kind?: 'rule' | 'lesson_toggle' | 'lesson_delete' | 'alias_add' | 'alias_delete';
      actionType?: MessengerAiActionType;
      enabled?: boolean;
      mode?: 'stage_confirm' | 'auto_apply';
      showSalesPopup?: boolean;
      minConfidence?: number;
      lessonId?: string;
      active?: boolean;
      aliasId?: string;
      phrase?: string;
      productId?: string;
      productName?: string;
    };

    if (body.kind === 'lesson_toggle' && body.lessonId) {
      await toggleCopilotLesson(supabase, body.lessonId, Boolean(body.active));
    } else if (body.kind === 'lesson_delete' && body.lessonId) {
      await deleteCopilotLesson(supabase, body.lessonId);
    } else if (body.kind === 'alias_add' && body.phrase && body.productId && body.productName) {
      await upsertManualAlias(supabase, {
        phrase: body.phrase,
        productId: body.productId,
        productName: body.productName,
      });
    } else if (body.kind === 'alias_delete' && body.aliasId) {
      await deleteCopilotAlias(supabase, body.aliasId);
    } else if (body.actionType) {
      await updateCopilotRule(supabase, {
        actionType: body.actionType,
        enabled: body.enabled,
        mode: body.mode,
        showSalesPopup: body.showSalesPopup,
        minConfidence: body.minConfidence,
        actorName: caller.name,
      });
    } else {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
