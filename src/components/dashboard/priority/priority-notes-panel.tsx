'use client';

import Link from 'next/link';
import { NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PriorityRow } from '@/lib/priority/priority-rules';

/**
 * Right side of a Priority List card: the order's latest notes from its
 * Activity & Notes, newest first, with Add note and a link to all notes.
 * Stacks under the order details on narrow screens.
 */
export function PriorityNotesPanel({ row, onAddNote }: { row: PriorityRow; onAddNote: () => void }) {
  const hidden = row.noteCount - row.recentNotes.length;
  return (
    <aside className="flex flex-col gap-2 rounded-md bg-muted/40 p-2.5 lg:w-80 lg:shrink-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notes{row.noteCount > 0 && ` (${row.noteCount})`}
        </span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onAddNote}>
          <NotebookPen className="mr-1 h-3.5 w-3.5" />Add note
        </Button>
      </div>

      {row.recentNotes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {row.recentNotes.map((n, i) => (
            <li key={`${n.stamp}-${i}`} className="rounded bg-background px-2 py-1.5 text-xs shadow-sm">
              <div className="flex flex-wrap justify-between gap-x-2">
                <span className="font-medium">{n.actor}</span>
                <span className="text-muted-foreground">{n.stamp}</span>
              </div>
              <p className="mt-0.5 line-clamp-4 whitespace-pre-line break-words">{n.text}</p>
            </li>
          ))}
        </ul>
      )}

      {row.noteCount > 0 && (
        <Link href={`/dashboard/orders/${row.id}#order-activity`} className="text-xs text-primary underline">
          {hidden > 0 ? `View all ${row.noteCount} notes` : 'Open in Activity & Notes'}
        </Link>
      )}
    </aside>
  );
}
