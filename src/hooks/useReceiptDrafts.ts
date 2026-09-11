import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import type { ReceiptScanDraft, ReceiptScanRow } from '@/types';

export function useReceiptDrafts() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<ReceiptScanDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDrafts = useCallback(async () => {
    if (!supabase) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('procurement_receipt_scans')
        .select('*')
        .eq('status', 'draft')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const mapped: ReceiptScanDraft[] = (data || []).map((row: any) => ({
        id: row.id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        status: row.status,
        imageUrl: row.image_url,
        rawLines: (row.raw_lines || []) as ReceiptScanRow[],
        engine: row.engine,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      setDrafts(mapped);
    } catch (err: any) {
      console.error('Error fetching receipt drafts:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const saveDraft = useCallback(
    async (params: {
      id?: string | null;
      supplierId: string | null;
      supplierName: string;
      imageUrl?: string | null;
      rows: ReceiptScanRow[];
      engine?: string | null;
    }): Promise<string | null> => {
      if (!supabase) return null;
      try {
        const payload: any = {
          supplier_id: params.supplierId || null,
          supplier_name: params.supplierName,
          status: 'draft',
          raw_lines: params.rows,
          engine: params.engine || null,
          updated_at: new Date().toISOString(),
        };

        if (params.imageUrl) {
          payload.image_url = params.imageUrl;
        }

        if (params.id) {
          const { error } = await supabase
            .from('procurement_receipt_scans')
            .update(payload)
            .eq('id', params.id);
          if (error) throw error;
          await fetchDrafts();
          return params.id;
        } else {
          const { data, error } = await supabase
            .from('procurement_receipt_scans')
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;
          await fetchDrafts();
          return data?.id || null;
        }
      } catch (err: any) {
        console.error('Error saving receipt draft:', err);
        toast({
          variant: 'destructive',
          title: 'Could not save draft',
          description: err.message || 'Failed to save receipt draft.',
        });
        throw err;
      }
    },
    [supabase, toast, fetchDrafts]
  );

  const completeDraft = useCallback(
    async (id: string) => {
      if (!supabase || !id) return;
      try {
        const { error } = await supabase
          .from('procurement_receipt_scans')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        await fetchDrafts();
      } catch (err: any) {
        console.error('Error completing receipt draft:', err);
      }
    },
    [supabase, fetchDrafts]
  );

  const deleteDraft = useCallback(
    async (id: string) => {
      if (!supabase || !id) return;
      try {
        const { error } = await supabase
          .from('procurement_receipt_scans')
          .delete()
          .eq('id', id);
        if (error) throw error;
        setDrafts((prev) => prev.filter((d) => d.id !== id));
        toast({
          title: 'Draft deleted',
          description: 'Receipt draft has been removed.',
        });
      } catch (err: any) {
        console.error('Error deleting receipt draft:', err);
        toast({
          variant: 'destructive',
          title: 'Delete failed',
          description: err.message || 'Failed to delete receipt draft.',
        });
      }
    },
    [supabase, toast]
  );

  return {
    drafts,
    loading,
    fetchDrafts,
    saveDraft,
    completeDraft,
    deleteDraft,
  };
}
