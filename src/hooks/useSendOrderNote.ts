'use client';

import { useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { postOrderNote, taggedNames } from '@/lib/services/order-note-service';
import { sendOrderNote } from '@/hooks/useStaffTasks';
import type { NoteRecipients } from '@/components/dashboard/tasks/note-recipient-picker';

/**
 * Saves an order note to Activity & Notes, then sends it to the people / teams
 * picked under "Para kanino?" and anyone @tagged (they get a pop-up).
 * Returns a toast title.
 */
export function useSendOrderNote() {
  const supabase = useSupabase();
  return useCallback(async (input: {
    orderId: string;
    text: string;
    authorName: string;
    mentions: string[];
    staff: { fullName?: string | null }[];
    recipients: NoteRecipients;
  }): Promise<string> => {
    if (!supabase) throw new Error('Not connected');
    const res = await postOrderNote(supabase, input);
    if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'Could not save the note');
    const names = taggedNames(input.text, input.mentions, input.staff, input.authorName);
    if (input.recipients.targetKeys.length === 0 && names.length === 0) return 'Note saved to the order';
    try {
      await sendOrderNote({
        orderId: input.orderId,
        message: input.text.trim(),
        targetKeys: input.recipients.targetKeys,
        mentionNames: names,
        needsAnswer: input.recipients.needsAnswer,
      });
    } catch (e) {
      throw new Error(`The note was saved, but nobody was told: ${e instanceof Error ? e.message : String(e)}`);
    }
    return 'Note saved and sent: they will get a pop-up';
  }, [supabase]);
}
