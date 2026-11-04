'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ShelfPrompt } from '@/hooks/picker/useShelfGuard';

interface Props {
  prompt: Extract<ShelfPrompt, { kind: 'os' }>;
  saving: boolean;
  onSave: (unit1Count: number) => void;
  onBack: () => void;
}

/**
 * Asked when a picker taps OS but the system says the shelf still has some
 * (owner 2026-11-04). The picker looks again, or counts the shelf so the system
 * number gets fixed before OS goes through. The count is blind: no system number.
 */
export function OsShelfCheck({ prompt, saving, onSave, onBack }: Props) {
  const [count, setCount] = useState('');
  const [unit2Checked, setUnit2Checked] = useState(false);
  const needsUnit2 = prompt.unit2 > 0;
  const canSave = count.trim() !== '' && Number(count) >= 0 && (!needsUnit2 || unit2Checked) && !saving;

  return (
    <>
      <DialogHeader>
        <DialogTitle>The system says this should be on the shelf</DialogTitle>
        <DialogDescription>
          {prompt.productName}: before marking OS, look again on the Unit 1 shelf, in nearby bins and in Unit 2 reserve.
          Check the size and color too: it may be the wrong variant.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Button className="w-full" disabled={saving} onClick={onBack}>Found it: go back and tap Found</Button>

        {prompt.deliveryWaiting && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            A delivery of this item is waiting on Receiving. Pieces still in unopened or uncounted boxes are not on the shelf yet:
            leave them out of the count.
          </div>
        )}

        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor="os-count" className="font-semibold">Still none? Count the shelf</Label>
          <p className="text-xs text-muted-foreground">
            How many are on the Unit 1 shelf now? Type 0 if there are none. This fixes the system&apos;s number.
          </p>
          {needsUnit2 && (
            <label className="flex items-start gap-2 rounded-md bg-blue-50 p-2 text-xs text-blue-950">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={unit2Checked} onChange={(e) => setUnit2Checked(e.target.checked)} />
              <span>
                Unit 2 reserve is recorded with {prompt.unit2}. <strong>I checked Unit 2 too: none there.</strong>
                {' '}(If there are some, take one and tap Found instead.)
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <Input id="os-count" type="number" inputMode="numeric" min={0} value={count} onChange={(e) => setCount(e.target.value)} className="w-28" />
            <Button variant="destructive" onClick={() => onSave(Math.round(Number(count)))} disabled={!canSave}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save count
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
