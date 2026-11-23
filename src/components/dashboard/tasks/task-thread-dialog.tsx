'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, MessageCircle, Send, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { fetchTaskMessages, sendTaskMessage, uploadTaskPhoto } from '@/hooks/useStaffTasks';
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
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  // Preview of the photo before sending; freed when it changes or the dialog closes.
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL only exists after the file is picked
    setPreview(url);
    return () => { URL.revokeObjectURL(url); setPreview(null); };
  }, [photo]);

  const clearPhoto = () => {
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = (next: boolean) => {
    if (!next) { setText(''); setMessages([]); clearPhoto(); }
    onOpenChange(next);
  };

  const send = async () => {
    if (!task || (!text.trim() && !photo)) return;
    setSending(true);
    try {
      const photoUrl = photo ? await uploadTaskPhoto(photo) : null;
      await sendTaskMessage(task.id, text.trim(), photoUrl);
      setText('');
      clearPhoto();
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
                  'max-w-[85%] space-y-1.5 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                  mine ? 'bg-blue-600 text-white' : 'border bg-background'
                )}>
                  {m.photoUrl && (
                    <a href={m.photoUrl} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- photo from the task bucket, any size */}
                      <img src={m.photoUrl} alt="Photo sent with the reply" className="max-h-48 rounded-md object-cover" />
                    </a>
                  )}
                  {m.body && <p>{m.body}</p>}
                </div>
                <span className="mt-0.5 text-[11px] text-muted-foreground">{m.authorName} · {phtWhen(m.createdAt)}</span>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {task?.status !== 'cancelled' && preview && (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview (object URL) */}
            <img src={preview} alt="Photo to send" className="h-20 rounded-md border object-cover" />
            <button
              type="button"
              onClick={clearPhoto}
              aria-label="Remove photo"
              className="absolute -right-2 -top-2 rounded-full bg-background p-0.5 shadow ring-1 ring-border"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {task?.status !== 'cancelled' && (
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
            <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()} aria-label="Add a photo" disabled={sending}>
              <Camera className="h-4 w-4" />
            </Button>
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={view === 'staff' ? 'Magtanong o sumagot…' : `Reply to ${other}…`}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            />
            <Button onClick={send} disabled={(!text.trim() && !photo) || sending} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
