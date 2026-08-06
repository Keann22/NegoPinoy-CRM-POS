import { useState, useEffect, useMemo } from 'react';
import { DateRange } from 'react-day-picker';
import { startOfDay, endOfDay, format } from 'date-fns';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
import * as xlsx from 'xlsx';
import type { PurchaseRow, UnrecordedRow, SupplierOption } from '@/types';

export function usePurchasesReport() {
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  
  const roles = useMemo(() => userProfile?.roles || [], [userProfile]);
  // Inventory staff see quantities/status only; Owner/Admin also see costs.
  const canSeeCosts = useMemo(() => roles.includes('Owner') || roles.includes('Admin'), [roles]);
  // Supplier identities are confidential — hidden from inventory staff everywhere
  // in this report (same tier as costs).
  const canSeeSuppliers = canSeeCosts;

  const [date, setDate] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [unrecorded, setUnrecorded] = useState<UnrecordedRow[]>([]);
  const [showUnrecorded, setShowUnrecorded] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  
  // Per-row edits, keyed by item id, seeded from the server's suggestions.
  const [drafts, setDrafts] = useState<Record<string, { supplierId: string; unitCost: string; receivedQty: string; receivedAt: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function fetchPurchases() {
      if (!date?.from) return;
      setLoading(true);
      try {
        // Day boundaries are computed in the browser's local timezone (PHT for
        // this business), then sent as UTC instants — so "a day" here means a
        // Philippine-time day even though the database stores UTC.
        const start = startOfDay(date.from).toISOString();
        const end = endOfDay(date.to || date.from).toISOString();
        const res = await fetch(`/api/reports/purchases?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load purchases');
        setPurchases(data.purchases || []);
        const rows: UnrecordedRow[] = data.unrecorded || [];
        setUnrecorded(rows);
        setSupplierOptions(data.suppliers || []);
        setDrafts(Object.fromEntries(rows.map(r => [r.id, {
          supplierId: r.suggestedSupplierId || '',
          unitCost: r.suggestedUnitCost ? String(r.suggestedUnitCost) : '',
          receivedQty: String(r.receivedQty),
          // <input type="date"> wants yyyy-MM-dd in local time, which is PHT here.
          receivedAt: r.receivedAt ? format(new Date(r.receivedAt), 'yyyy-MM-dd') : '',
        }])));
      } catch (err: any) {
        console.error('Failed to fetch purchases report', err);
        alert('Failed to load purchases report: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPurchases();
  }, [date, reloadKey]);

  const totals = useMemo(() => ({
    spend: purchases.reduce((acc, p) => acc + p.totalCost, 0),
    pieces: purchases.reduce((acc, p) => acc + p.qty, 0),
    products: new Set(purchases.map(p => p.productId)).size,
    entries: purchases.length,
  }), [purchases]);

  // Consolidated view: one line per product across every supplier/purchase,
  // with a weighted average cost (cost-bearing lines only, so a ₱0 placeholder
  // entry doesn't drag the average down).
  const byProduct = useMemo(() => {
    const map = new Map<string, {
      productId: string; productName: string; qty: number; totalCost: number;
      costedQty: number; entries: number; suppliers: Set<string>; receivedQty: number;
    }>();
    purchases.forEach(p => {
      const existing = map.get(p.productId) || {
        productId: p.productId, productName: p.productName, qty: 0, totalCost: 0,
        costedQty: 0, entries: 0, suppliers: new Set<string>(), receivedQty: 0,
      };
      existing.qty += p.qty;
      existing.totalCost += p.totalCost;
      if (p.unitCost > 0) existing.costedQty += p.qty;
      existing.entries += 1;
      existing.receivedQty += p.receivedQty;
      if (p.supplierName) existing.suppliers.add(p.supplierName);
      map.set(p.productId, existing);
    });
    return Array.from(map.values())
      .map(p => ({ ...p, avgCost: p.costedQty > 0 ? p.totalCost / p.costedQty : 0 }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [purchases]);

  const bySupplier = useMemo(() => {
    const map = new Map<string, { supplierName: string; items: PurchaseRow[]; totalCost: number; pieces: number }>();
    purchases.forEach(p => {
      const key = p.supplierName || 'No Supplier';
      const existing = map.get(key) || { supplierName: key, items: [], totalCost: 0, pieces: 0 };
      existing.items.push(p);
      existing.totalCost += p.totalCost;
      existing.pieces += p.qty;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [purchases]);

  const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleRecord = async (row: UnrecordedRow) => {
    const draft = drafts[row.id] || { supplierId: '', unitCost: '', receivedQty: String(row.receivedQty), receivedAt: '' };
    const cost = Number(draft.unitCost);
    const qty = draft.receivedQty === '' ? null : Number(draft.receivedQty);
    const qtyChanged = qty !== null && qty !== row.receivedQty;

    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
      toast({ variant: 'destructive', title: 'Invalid quantity', description: 'Received must be zero or more.' });
      return;
    }
    if (!draft.supplierId && !(cost > 0) && !qtyChanged) {
      toast({ variant: 'destructive', title: 'Nothing to record', description: 'Pick a supplier, enter a unit cost, or correct the received quantity.' });
      return;
    }
    if (qtyChanged && !window.confirm(
      `Change received for ${row.productName} from ${row.receivedQty} to ${qty}?\n\n` +
      `This moves live stock by ${qty - row.receivedQty > 0 ? '+' : ''}${qty - row.receivedQty} and amends the inventory ledger.`
    )) {
      return;
    }

    setSavingId(row.id);
    try {
      const res = await fetch('/api/reports/purchases/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: row.id,
          supplierId: draft.supplierId || null,
          unitCost: cost || null,
          receivedQty: qtyChanged ? qty : null,
          receivedAt: draft.receivedAt || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to record');

      const parts = [`${row.productName} recorded${result.supplierName ? ` under ${result.supplierName}` : ''}`];
      parts[0] += draft.receivedAt ? ` on ${format(new Date(draft.receivedAt), 'MMM d')}.` : '.';
      if (result.qtyDelta) {
        parts.push(`Received corrected to ${qty} (stock ${result.qtyDelta > 0 ? '+' : ''}${result.qtyDelta}).`);
      }
      if (result.expectedNow !== null) {
        parts.push(`Valued at ${result.expectedNow} delivered rather than ${result.expectedWas} requested.`);
      }
      if (result.linesUpdated > 0) {
        parts.push(`COGS backfilled onto ${result.linesUpdated} sold order line${result.linesUpdated === 1 ? '' : 's'} (${peso(Number(result.cogsAdded))}).`);
      }
      toast({ title: 'Purchase recorded', description: parts.join(' ') });

      setUnrecorded(prev => prev.filter(u => u.id !== row.id));
      // The buy is dated to when the goods landed, which may fall outside the
      // range on screen - refetch so the report reflects wherever it landed.
      setReloadKey(k => k + 1);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not record', description: err.message });
    } finally {
      setSavingId(null);
    }
  };

  const handleExportExcel = () => {
    const wb = xlsx.utils.book_new();

    if (canSeeSuppliers) {
      const supplierRows: any[] = [];
      bySupplier.forEach(group => {
        group.items.forEach(item => {
          supplierRows.push({
            'Supplier': group.supplierName,
            'Product': item.productName,
            'Qty': item.qty,
            ...(canSeeCosts ? { 'Unit Cost': item.unitCost, 'Total': item.totalCost } : {}),
            'Received': item.receivedQty,
            'Status': item.status === 'received' ? 'Received' : 'Pending Receipt',
            'Batch': item.batchName || '',
            'Date & Time': format(new Date(item.purchasedAt), 'yyyy-MM-dd hh:mm a'),
          });
        });
        supplierRows.push({
          'Supplier': `${group.supplierName} — SUBTOTAL`,
          'Product': '', 'Qty': group.pieces,
          ...(canSeeCosts ? { 'Unit Cost': '', 'Total': group.totalCost } : {}),
          'Received': '', 'Status': '', 'Batch': '', 'Date & Time': '',
        });
      });
      supplierRows.push({
        'Supplier': 'GRAND TOTAL', 'Product': '', 'Qty': totals.pieces,
        ...(canSeeCosts ? { 'Unit Cost': '', 'Total': totals.spend } : {}),
        'Received': '', 'Status': '', 'Batch': '', 'Date & Time': '',
      });
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(supplierRows), 'By Supplier');
    } else {
      // Staff export: flat itemized list, no supplier dimension at all.
      const itemRows: any[] = purchases.map(item => ({
        'Product': item.productName,
        'Qty': item.qty,
        'Received': item.receivedQty,
        'Status': item.status === 'received'
          ? 'Received'
          : item.receivedQty > 0 ? `Partial (${item.receivedQty}/${item.qty})` : 'Pending Receipt',
        'Batch': item.batchName || '',
        'Date & Time': format(new Date(item.purchasedAt), 'yyyy-MM-dd hh:mm a'),
      }));
      itemRows.push({
        'Product': 'GRAND TOTAL', 'Qty': totals.pieces,
        'Received': '', 'Status': '', 'Batch': '', 'Date & Time': '',
      });
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(itemRows), 'Purchases');
    }

    const productRows: any[] = byProduct.map(p => ({
      'Product': p.productName,
      'Total Qty': p.qty,
      ...(canSeeCosts ? { 'Avg Unit Cost': Number(p.avgCost.toFixed(2)), 'Total Cost': p.totalCost } : {}),
      'Purchases': p.entries,
      ...(canSeeSuppliers ? { 'Suppliers': Array.from(p.suppliers).join(', ') } : {}),
      'Received': p.receivedQty,
    }));
    productRows.push({
      'Product': 'GRAND TOTAL', 'Total Qty': totals.pieces,
      ...(canSeeCosts ? { 'Avg Unit Cost': '', 'Total Cost': totals.spend } : {}),
      'Purchases': totals.entries, ...(canSeeSuppliers ? { 'Suppliers': '' } : {}), 'Received': '',
    });
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(productRows), 'By Product');

    const fileLabel = date?.from
      ? (date.to && format(date.to, 'yyyyMMdd') !== format(date.from, 'yyyyMMdd')
          ? `${format(date.from, 'yyyyMMdd')}-${format(date.to, 'yyyyMMdd')}`
          : format(date.from, 'yyyyMMdd'))
      : format(new Date(), 'yyyyMMdd');
    xlsx.writeFile(wb, `Purchases_${fileLabel}.xlsx`);
  };

  const rangeLabel = date?.from
    ? (date.to && format(date.to, 'yyyy-MM-dd') !== format(date.from, 'yyyy-MM-dd')
        ? `${format(date.from, 'MMM d, yyyy')} – ${format(date.to, 'MMM d, yyyy')}`
        : format(date.from, 'MMM d, yyyy'))
    : '';

  return {
    canSeeCosts,
    canSeeSuppliers,
    date,
    setDate,
    loading,
    purchases,
    unrecorded,
    showUnrecorded,
    setShowUnrecorded,
    supplierOptions,
    drafts,
    setDrafts,
    savingId,
    totals,
    byProduct,
    bySupplier,
    handleRecord,
    handleExportExcel,
    rangeLabel,
    peso
  };
}
