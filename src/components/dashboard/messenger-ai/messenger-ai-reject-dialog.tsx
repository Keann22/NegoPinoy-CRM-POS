'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ERROR_CATEGORY_META, type MessengerAiErrorCategory } from '@/types';

interface MessengerAiRejectDialogProps {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmReject: (category: MessengerAiErrorCategory, note: string | null) => Promise<void>;
}

const CATEGORIES = Object.entries(ERROR_CATEGORY_META) as [
  MessengerAiErrorCategory,
  (typeof ERROR_CATEGORY_META)[MessengerAiErrorCategory],
][];

export function MessengerAiRejectDialog({
  open,
  busy,
  onOpenChange,
  onConfirmReject,
}: MessengerAiRejectDialogProps) {
  const [category, setCategory] = useState<MessengerAiErrorCategory>('inquiry_only');
  const [note, setNote] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirmReject(category, note.trim() || null);
    setNote('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bakit mali? (Teach the AI)</DialogTitle>
          <DialogDescription>
            Pick one reason so the AI stops repeating this mistake.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={`text-left p-2.5 rounded-xl border transition-all ${
                  category === key
                    ? 'bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-300 font-semibold'
                    : 'bg-background hover:bg-muted border-border'
                }`}
              >
                <div className="font-semibold">{meta.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{meta.hint}</div>
              </button>
            ))}
          </div>

          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional short note (e.g. 'Customer was referring to an old delivered order')"
            className="text-xs"
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? 'Saving...' : 'Mark Mali & Save Lesson'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
