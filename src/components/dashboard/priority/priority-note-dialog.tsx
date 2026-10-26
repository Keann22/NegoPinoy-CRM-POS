'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MentionInput } from '@/components/dashboard/mention-input';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { postOrderNote } from '@/lib/services/order-note-service';
import type { PriorityRow } from '@/lib/priority/priority-rules';

/**
 * Add a note to an order from the Priority List. It goes to the same place as
 * the order page's Activity & Notes, and @tagged staff get a message.
 */
export function PriorityNoteDialog({ row, onClose, onSaved }: { row: PriorityRow | null; onClose: () => void; onSaved: () => void }) {
  const supabase = useSupabase();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const { staff } = useStaffDirectory();
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(''); setMentions([]); }, [row?.id]);

  if (!row) return null;
  const shortId = row.id.slice(0, 7).toUpperCase();
  const authorName = userProfile
    ? `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() || userProfile.email || 'Staff'
    : 'Staff';

  const save = async () => {
    if (!supabase || !text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await postOrderNote(supabase, { orderId: row.id, text, authorName, mentions, staff });
      if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'Could not save the note');
      toast({ title: mentions.length ? `Note saved — ${mentions.join(', ')} notified` : 'Note saved to the order' });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save the note', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add note</DialogTitle>
          <DialogDescription>
            #{shortId} · {row.customerName || 'Customer'} — saved to the order&apos;s Activity &amp; Notes. Type @ to tag staff; they get a message.
          </DialogDescription>
        </DialogHeader>
        {row.lastNote && (
          <div className="rounded-md bg-muted/60 px-2 py-1.5 text-xs">
            <span className="font-medium">Latest: {row.lastNote.actor}</span>
            <span className="text-muted-foreground"> · {row.lastNote.stamp}</span>
            <div className="line-clamp-3 whitespace-pre-line">{row.lastNote.text}</div>
          </div>
        )}
        <MentionInput
          value={text}
          onChange={setText}
          mentions={mentions}
          onMentionsChange={setMentions}
          onSubmit={save}
          placeholder="Write a note... Type @ to tag staff"
          multiline
          rows={3}
          dropdownPosition="bottom"
          disabled={saving}
        />
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Link href={`/dashboard/orders/${row.id}#order-activity`} className="text-xs text-primary underline">
            View all notes{row.noteCount > 0 ? ` (${row.noteCount})` : ''}
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !text.trim()}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}Save note
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
