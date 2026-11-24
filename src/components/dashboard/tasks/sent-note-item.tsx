'use client';

import Link from 'next/link';
import { Check, CheckCircle2, Eye, EyeOff, MessageCircle, Package, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { phtWhen } from '@/lib/services/staff-tasks/task-dates';
import type { StaffTask } from '@/types/staff-tasks.types';

/** Where a note I sent stands: Hindi pa nakikita → Seen by Al → Answered by Al. */
function NoteStatus({ note }: { note: StaffTask }) {
  if (note.status === 'done' && note.doneAt) {
    return (
      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />{note.needsAnswer ? 'Answered' : 'Seen'} by {note.doneByName} · {phtWhen(note.doneAt)}
      </span>
    );
  }
  if (note.seenAt) {
    return <span className="flex items-center gap-1 text-sky-700 dark:text-sky-400"><Eye className="h-3.5 w-3.5" />Seen by {note.seenByName} · {phtWhen(note.seenAt)}, waiting for the answer</span>;
  }
  return (
    <span className={cn('flex items-center gap-1', note.unseenTooLong ? 'font-medium text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400')}>
      <EyeOff className="h-3.5 w-3.5" />Hindi pa nakikita{note.unseenTooLong ? ' (2+ oras na)' : ''}
    </span>
  );
}

/** A note I sent: who it's for, where it stands, the answer, and Read answer / Ok / Bawiin. */
export function SentNoteItem({ note, busy, onRead, onAck, onCancel }: {
  note: StaffTask;
  busy?: boolean;
  onRead?: (n: StaffTask) => void;
  onAck?: (n: StaffTask) => void;
  onCancel?: (n: StaffTask) => void;
}) {
  const alert = !note.seenAt && note.unseenTooLong && !note.senderNudged;
  return (
    <div className={cn(
      'space-y-2 rounded-lg border p-3',
      note.senderUnread && 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30',
      alert && 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30'
    )}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>Para kay <span className="font-medium text-foreground">{note.assigneeName}</span> · {phtWhen(note.createdAt)}</span>
        <span>· {note.needsAnswer ? 'Kailangan ng sagot' : 'Pasabi lang po'}</span>
        {note.senderUnread && <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">May sagot na</Badge>}
      </div>
      <p className="whitespace-pre-wrap text-sm">{note.message}</p>
      {note.orderId && (
        <Link href={`/dashboard/orders/${note.orderId}`} className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm hover:underline">
          <Package className="h-3.5 w-3.5" />
          <span className="font-semibold">{note.orderShortId}</span>
          {note.orderCustomer && <span>· {note.orderCustomer}</span>}
        </Link>
      )}
      <div className="text-xs"><NoteStatus note={note} /></div>
      {alert && (
        <p className="text-sm text-red-800 dark:text-red-300">
          Wala pang nakakakita nito sa loob ng 2 oras. Pakisabihan sila sa Messenger o tawagan; nakikita na rin ito ng owners.
        </p>
      )}
      {note.doneNote && <p className="whitespace-pre-wrap rounded-md bg-emerald-50 p-2 text-sm dark:bg-emerald-950/40">&ldquo;{note.doneNote}&rdquo;</p>}
      <div className="flex flex-wrap gap-2">
        {onRead && (note.messageCount > 0 || note.status === 'open') && (
          <Button size="sm" variant={note.senderUnread ? 'default' : 'outline'} disabled={busy} onClick={() => onRead(note)}>
            <MessageCircle className="mr-1.5 h-4 w-4" />
            {note.senderUnread && note.messageCount > 0 ? 'Basahin ang sagot' : note.messageCount > 0 ? `Replies (${note.messageCount})` : 'Mag-follow up'}
          </Button>
        )}
        {onAck && (note.senderUnread || alert) && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAck(note)}>
            <Check className="mr-1.5 h-4 w-4" />Ok
          </Button>
        )}
        {onCancel && note.status === 'open' && (
          <Button size="sm" variant="ghost" disabled={busy} className="text-muted-foreground" onClick={() => onCancel(note)}>
            <Undo2 className="mr-1.5 h-4 w-4" />Bawiin
          </Button>
        )}
      </div>
    </div>
  );
}
