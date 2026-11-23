'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { fetchTaskMessages, sendTaskMessage } from '@/hooks/useStaffTasks';
import { phtWhen } from '@/lib/services/staff-tasks/task-dates';
import { cn } from '@/lib/utils';
import type { StaffTask, StaffTaskMessage } from '@/types/staff-tasks.types';

/**
 * Questions and replies on a task. Staff ask ("Saan ilalagay?"), owners answer.
 * Opening it marks the replies read; sending tells the other side.
 */
export function TaskThreadDialog({ task, view, onOpenChange }: {
  task: StaffTask | null;
  /** staff: the person the task is for; owner: the owners. */
  view: 'staff' | 'owner';
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<StaffTaskMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taskId = task?.id;

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the replies when the dialog opens
    setLoading(true);
    fetchTaskMessages(taskId)
      .then((m) => { if (!cancelled) setMessages(m); })
      .catch((e) => toast({ variant: 'destructive', title: 'Replies not loaded', description: e instanceof Error ? e.message : String(e) }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, toast]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const close = (next: boolean) => {
    if (!next) { setText(''); setMessages([]); }
    onOpenChange(next);
  };

  const send = async () => {
    if (!task || !text.trim()) return;
    setSending(true);
    try {
      await sendTaskMessage(task.id, text.trim());
      setText('');
      setMessages(await fetchTaskMessages(task.id));
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not sent', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  };

  const other = view === 'staff' ? task?.assignedByName : task?.assigneeName;

  return (
    <Dialog open={!!task} onOpenChange={close}>
      <DialogContent className="flex max-h-[90vh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-blue-600" /> Replies</DialogTitle>
          <DialogDescription className="text-base text-foreground">{task?.message}</DialogDescription>
        </DialogHeader>

        <div className="min-h-24 flex-1 space-y-2 overflow-y-auto rounded-md bg-muted/40 p-2">
          {loading && messages.length === 0 && <p className="p-2 text-sm text-muted-foreground">Loading…</p>}
          {!loading && messages.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              {view === 'staff' ? `Wala pang tanong. May tanong ka kay ${other}? Isulat sa baba.` : `No replies yet. Write to ${other} below.`}
            </p>
          )}
          {messages.map((m) => {
            const mine = view === 'owner' ? m.fromOwner : !m.fromOwner;
            return (
              <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                <div className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                  mine ? 'bg-blue-600 text-white' : 'border bg-background'
                )}>
                  {m.body}
                </div>
                <span className="mt-0.5 text-[11px] text-muted-foreground">{m.authorName} · {phtWhen(m.createdAt)}</span>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {task?.status !== 'cancelled' && (
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={view === 'staff' ? 'Magtanong o sumagot…' : `Reply to ${other}…`}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            />
            <Button onClick={send} disabled={!text.trim() || sending} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
