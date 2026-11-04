'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { RecountPageRow } from '@/types/inventory-guardian.types';

interface Props {
  row: RecountPageRow;
  onSave: (id: string, unit1: number, unit2: number) => Promise<void>;
}

/** One product to count: Unit 1 and Unit 2, blind (no system number). */
export function RecountLine({ row, onSave }: Props) {
  const { toast } = useToast();
  const [u1, setU1] = useState('');
  const [u2, setU2] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (u1.trim() === '' || u2.trim() === '') {
      toast({ title: 'Ilagay ang bilang sa Unit 1 at Unit 2', description: 'Ilagay 0 kung wala.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await onSave(row.id, Number(u1), Number(u2));
      toast({ title: 'Salamat! Na-save ang bilang', description: row.productName });
    } catch (e) {
      toast({ title: 'Hindi na-save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="font-medium leading-tight">
        {row.productName}{row.sku ? <span className="text-xs text-muted-foreground"> · {row.sku}</span> : null}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Unit 1
          <Input type="number" inputMode="numeric" min={0} className="h-10 w-20" value={u1} onChange={(e) => setU1(e.target.value)} />
        </label>
        <label className="text-xs text-muted-foreground">
          Unit 2
          <Input type="number" inputMode="numeric" min={0} className="h-10 w-20" value={u2} onChange={(e) => setU2(e.target.value)} />
        </label>
        <Button onClick={submit} disabled={saving} className="h-10">
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}I-save
        </Button>
      </div>
    </div>
  );
}
