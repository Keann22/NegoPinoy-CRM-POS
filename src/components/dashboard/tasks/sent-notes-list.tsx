'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSentNotes } from '@/hooks/useStaffTasks';
import { useSentNoteActions } from '@/hooks/useSentNoteActions';
import { SentNoteItem } from './sent-note-item';

/** Tasks page: order notes I sent (open, and answered this week). Nothing when there are none. */
export function SentNotesList() {
  const { notes } = useSentNotes();
  const { busyId, handlers, dialogs } = useSentNoteActions();
  if (notes.length === 0) return null;
  const open = notes.filter((n) => n.status === 'open' || n.senderUnread);
  const done = notes.filter((n) => !open.includes(n));
  return (
    <Card id="sent-notes">
      <CardHeader>
        <CardTitle>Notes I sent</CardTitle>
        <CardDescription>Whether they saw it and what they answered. Answers also pop up for you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {open.length === 0 && <p className="text-sm text-muted-foreground">Not waiting for any answers.</p>}
        {open.map((n) => <SentNoteItem key={n.id} note={n} busy={busyId === n.id} {...handlers} />)}
        {done.length > 0 && (
          <>
            <p className="pt-2 text-sm font-medium text-muted-foreground">Answered / seen this week</p>
            {done.map((n) => <SentNoteItem key={n.id} note={n} onRead={handlers.onRead} />)}
          </>
        )}
      </CardContent>
      {dialogs}
    </Card>
  );
}
