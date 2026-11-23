'use client';

import { useState } from 'react';
import { Loader2, MessageSquarePlus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MentionInput } from '@/components/dashboard/mention-input';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { postOrderNote } from '@/lib/services/order-note-service';

interface Props {
  orderId: string;
  notes: string | null;
  staff: { fullName?: string | null }[];
  onSaved: () => void;
}

/**
 * Connected directly to orders.notes (Activity & Notes + printed Order Form).
 * Staff can view existing notes and add new ones (with @mentions) right from Ready to Pick.
 */
export function ReadyToPickNoteSection({ orderId, notes, staff, onSaved }: Props) {
  const supabase = useSupabase();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const authorName = userProfile
    ? `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() || userProfile.email || 'Staff'
    : 'Staff';

  const save = async () => {
    if (!supabase || !text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await postOrderNote(supabase, { orderId, text, authorName, mentions, staff });
      if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'Could not save note');
      toast({ title: mentions.length ? `Note saved — ${mentions.join(', ')} notified` : 'Note saved to order' });
      setText('');
      setMentions([]);
      setComposing(false);
      onSaved();
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not save note',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const isLong = Boolean(notes && (notes.length > 180 || notes.split('\n').length > 3));

  return (
    <div className="mt-2.5 space-y-2 rounded-md border bg-amber-50/40 px-3 py-2 text-xs dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-muted-foreground">Order Notes (also shown on Order Form)</span>
        {!composing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setComposing(true)}
          >
            <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />
            Add note
          </Button>
        )}
      </div>

      {notes ? (
        <div className="space-y-1">
          <p className={`whitespace-pre-wrap text-foreground ${!expanded && isLong ? 'line-clamp-3' : ''}`}>
            {notes}
          </p>
          {isLong && (
            <button
              type="button"
              className="text-[11px] font-medium text-primary hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Show all notes'}
            </button>
          )}
        </div>
      ) : (
        !composing && <p className="text-muted-foreground italic">No notes yet.</p>
      )}

      {composing && (
        <div className="space-y-2 pt-1">
          <MentionInput
            value={text}
            onChange={setText}
            mentions={mentions}
            onMentionsChange={setMentions}
            onSubmit={save}
            placeholder="Write a note… Type @ to tag staff"
            multiline
            rows={2}
            dropdownPosition="bottom"
            disabled={saving}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={saving}
              onClick={() => {
                setComposing(false);
                setText('');
                setMentions([]);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={saving || !text.trim()}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
              Save note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
