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
        <CardTitle>Mga note na pinadala ko</CardTitle>
        <CardDescription>Kung nakita na nila at ano ang sagot. Ang sagot ay mag-pop-up din sa iyo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {open.length === 0 && <p className="text-sm text-muted-foreground">Walang hinihintay na sagot.</p>}
        {open.map((n) => <SentNoteItem key={n.id} note={n} busy={busyId === n.id} {...handlers} />)}
        {done.length > 0 && (
          <>
            <p className="pt-2 text-sm font-medium text-muted-foreground">Sinagot / nakita ngayong linggo</p>
            {done.map((n) => <SentNoteItem key={n.id} note={n} onRead={handlers.onRead} />)}
          </>
        )}
      </CardContent>
      {dialogs}
    </Card>
  );
}
