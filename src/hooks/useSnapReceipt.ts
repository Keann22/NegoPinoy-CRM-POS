import { useCallback, useEffect, useRef, useState } from 'react';
import { receiptFileToDataUri } from '@/lib/receipt-image';

export type SnapSupplier = { id: string; name: string };
export type SnapResult = { lines: number; recorded: number; toMatch: number };
export type SnapPhoto = {
  key: string;
  file: File;
  previewUrl: string;
  status: 'waiting' | 'reading' | 'done' | 'failed';
  result?: SnapResult;
  error?: string;
};
export type RecentReceipt = {
  id: string;
  createdAt: string;
  createdBy: string | null;
  supplierName: string | null;
  photos: { id: string; status: string; error: string | null }[];
  recorded: number;
  toMatch: number;
  notProduct: number;
  notInList: { id: string; description: string; qty: number; unitCost: number }[];
};

const RECENT_KEY = 'snapRecentSuppliers';
const readRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
};

// Snap receipt: photos go up one at a time, each read on the server, while the
// page stays open. A failed photo stays on the list with Retry.
export function useSnapReceipt() {
  const [suppliers, setSuppliers] = useState<SnapSupplier[]>([]);
  const [receipts, setReceipts] = useState<RecentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  // '' = supplier not known.
  const [supplierId, setSupplierId] = useState('');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<SnapPhoto[]>([]);
  const busy = useRef(false);
  const queue = useRef<SnapPhoto[]>([]);
  const receiptRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/purchase-receipts', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setSuppliers(data.suppliers || []);
      setReceipts(data.receipts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRecentIds(readRecent());
    load();
  }, [load]);

  const working = photos.some((p) => p.status === 'waiting' || p.status === 'reading');

  // Warn before leaving while photos are still going up.
  useEffect(() => {
    if (!working) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [working]);

  const patch = (key: string, p: Partial<SnapPhoto>) =>
    setPhotos((prev) => prev.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const ensureReceipt = async () => {
    if (receiptRef.current) return receiptRef.current;
    const res = await fetch('/api/inventory/purchase-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: supplierId || null }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not start the receipt');
    receiptRef.current = data.id;
    setReceiptId(data.id);
    if (supplierId) {
      const next = [supplierId, ...readRecent().filter((id) => id !== supplierId)].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      setRecentIds(next);
    }
    return data.id as string;
  };

  const send = async (photo: SnapPhoto) => {
    patch(photo.key, { status: 'reading', error: undefined });
    try {
      const id = await ensureReceipt();
      const res = await fetch('/api/inventory/purchase-receipts/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId: id, imageBase64: await receiptFileToDataUri(photo.file) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      if (data.lines === 0) throw new Error("Couldn't read any items. Retake it straight on, in good light.");
      patch(photo.key, { status: 'done', result: data });
    } catch (e: any) {
      patch(photo.key, { status: 'failed', error: e.message || 'Upload failed' });
    }
  };

  // One at a time, in the order taken. Photos added mid-run join the queue.
  const drain = async (more: SnapPhoto[]) => {
    queue.current.push(...more);
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length > 0) await send(queue.current.shift()!);
    } finally {
      busy.current = false;
      load();
    }
  };

  const addPhotos = (files: File[]) => {
    const added: SnapPhoto[] = files.map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'waiting',
    }));
    setPhotos((prev) => [...prev, ...added]);
    drain(added);
  };

  const retry = (key: string) => {
    const p = photos.find((x) => x.key === key);
    if (p) drain([p]);
  };

  // Next receipt: maybe a different supplier.
  const newReceipt = () => {
    receiptRef.current = null;
    setReceiptId(null);
    setPhotos([]);
    setSupplierId('');
  };

  return {
    suppliers, receipts, loading, recentIds,
    supplierId, setSupplierId, receiptId, photos, working,
    addPhotos, retry, newReceipt,
  };
}
