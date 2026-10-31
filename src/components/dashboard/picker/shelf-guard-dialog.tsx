'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { ShelfPrompt } from '@/hooks/picker/useShelfGuard';

interface Props {
  prompt: ShelfPrompt | null;
  onCount: (unit1Count: number) => Promise<boolean | undefined>;
  onNotReceived: () => void;
  onBothEmpty: () => Promise<void>;
  onClose: () => void;
}

/**
 * Asked when a picker taps Found for more than the shelf has, or Borrow while
 * the shelf still has stock. The count is blind: the system's number isn't shown.
 */
export function ShelfGuardDialog({ prompt, onCount, onNotReceived, onBothEmpty, onClose }: Props) {
  const { toast } = useToast();
  const [count, setCount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCount(''); setSaving(false); }, [prompt]);

  if (!prompt) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await fn();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      setSaving(false);
    }
  };

  const saveCount = () => run(async () => {
    const n = Math.round(Number(count));
    if (count.trim() === '' || !(n >= 0)) throw new Error('Type how many you counted.');
    const enough = await onCount(n);
    toast({
      title: 'Count saved',
      description: enough ? 'Marked Found.' : 'Not enough on the shelf: the rest is marked OS.',
    });
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        {prompt.kind === 'count' ? (
          <>
            <DialogHeader>
              <DialogTitle>The system says there isn&apos;t enough on the shelf</DialogTitle>
              <DialogDescription>
                {prompt.productName}: this order needs {prompt.needed}. Where did you get it?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="sg-count" className="font-semibold">It&apos;s on the shelf: count it</Label>
                <p className="text-xs text-muted-foreground">
                  How many are on the Unit 1 shelf now, including the ones in your hand?
                  {prompt.unit2 > 0 && ` Unit 2 reserve is recorded with ${prompt.unit2}: check there too, but leave those out of this count.`}
                </p>
                <div className="flex gap-2">
                  <Input id="sg-count" type="number" inputMode="numeric" min={0} value={count} onChange={(e) => setCount(e.target.value)} className="w-28" />
                  <Button onClick={saveCount} disabled={saving || count.trim() === ''}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save count
                  </Button>
                </div>
              </div>
              <Button variant="outline" className="w-full justify-start h-auto py-2 text-left whitespace-normal" disabled={saving}
                onClick={() => { onNotReceived(); toast({ title: 'Marked OS', description: 'Note it on Receiving ("Arrived but not on the list?") and message the owners to record the purchase.' }); }}>
                From a new delivery that isn&apos;t received yet → mark OS
              </Button>
              <Button variant="ghost" className="w-full justify-start" disabled={saving} onClick={onClose}>
                Not sure: let me check the item again (size, color)
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Check the shelf before borrowing</DialogTitle>
              <DialogDescription>
                The system says there are still {prompt.available} of {prompt.productName} available.
                Look on the Unit 1 shelf{prompt.unit2 > 0 ? ` and in Unit 2 reserve (${prompt.unit2} there)` : ' and in Unit 2 reserve'} first.
                Unit 2 stock is free to take; borrowing takes another customer&apos;s item.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Button className="w-full" disabled={saving} onClick={onClose}>Found it: go back and tap Found</Button>
              <Button variant="outline" className="w-full whitespace-normal h-auto py-2" disabled={saving} onClick={() => run(onBothEmpty)}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}I checked Unit 1 and Unit 2: none there → borrow
              </Button>
              <p className="text-xs text-muted-foreground">This is saved as a shelf count of 0.</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
