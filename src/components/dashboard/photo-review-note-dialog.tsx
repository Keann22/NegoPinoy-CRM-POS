import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { PHOTO_REVIEW_FINDINGS, buildPhotoReviewNote, type PhotoReviewOrder } from '@/lib/photo-review';

interface PhotoReviewNoteDialogProps {
  order: PhotoReviewOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (orderId: string, updatedNotes: string) => void;
}

export function PhotoReviewNoteDialog({ order, open, onOpenChange, onSaved }: PhotoReviewNoteDialogProps) {
  const [finding, setFinding] = useState('');
  const [noteText, setNoteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = useSupabase();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();

  useEffect(() => {
    if (open) {
      setFinding('');
      setNoteText('');
    }
  }, [open, order?.id]);

  const handleSubmit = async () => {
    if (!order || !supabase) return;

    if (!finding || !noteText.trim()) {
      toast({ variant: 'destructive', title: 'Note incomplete', description: 'Pick what happened and write a short note.' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Re-read the notes first so a note someone else just added is not overwritten.
      const { data: fresh, error: readError } = await supabase.from('orders').select('notes').eq('id', order.id).single();
      if (readError) throw readError;

      const userName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Unknown Staff';
      const timestamp = format(new Date(), 'MMM d, yyyy h:mm a');
      const newNoteEntry = `[${timestamp}] ${userName}:\n${buildPhotoReviewNote(finding, noteText)}`;
      const updatedNotes = fresh?.notes ? `${fresh.notes}\n\n${newNoteEntry}` : newNoteEntry;

      const { error } = await supabase.from('orders').update({ notes: updatedNotes }).eq('id', order.id);
      if (error) throw error;

      toast({ title: 'Note saved', description: `Saved on order #${order.id.split('-')[0].toUpperCase()}.` });
      onSaved(order.id, updatedNotes);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving photo review note:', error);
      toast({ variant: 'destructive', title: 'Save failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Order #{order?.id.split('-')[0].toUpperCase()} — {order?.customerName}
          </DialogTitle>
          <DialogDescription>
            Tell us what really happened to this order. Your note is saved on the order itself.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {order && order.items.length > 0 && (
            <div className="space-y-1">
              <Label>Items</Label>
              <ul className="text-sm text-muted-foreground max-h-28 overflow-y-auto">
                {order.items.map((item, i) => (
                  <li key={i}>{item.quantity} × {item.name}</li>
                ))}
              </ul>
            </div>
          )}
          {order?.notes && (
            <div className="space-y-1">
              <Label>Existing notes</Label>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words max-h-32 overflow-y-auto rounded-md border p-2">
                {order.notes}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>What happened to this order?</Label>
            <Select value={finding} onValueChange={setFinding}>
              <SelectTrigger>
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {PHOTO_REVIEW_FINDINGS.map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Customer backed out last Sept, items returned to shelf. / Already shipped via J&T on Aug 12, tracking..."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
