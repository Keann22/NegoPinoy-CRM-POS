"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type Product = {
  id: string;
  name: string;
  variant_name: string | null;
  stock_level: number;
};

type EntryRow = {
  id: string;
  productId: string;
  qty: string;
  reasonCode: string;
  notes: string;
  status: 'pending' | 'success' | 'error';
  discrepancyMessage?: string;
  expectedStock?: number;
  discrepancyToApply?: number;
};

type OnHoldCustomer = {
  orderId: string;
  customerName: string;
  quantity: number;
  holdSince: string | null;
  holdReason: string | null;
};

export default function OutOfStockAudit() {
  const [products, setProducts] = useState<Product[]>([]);
  const [snapshotTime, setSnapshotTime] = useState<string>(
    new Date().toISOString().slice(0, 16) // "YYYY-MM-DDThh:mm"
  );

  const [rows, setRows] = useState<EntryRow[]>([
    { id: Math.random().toString(), productId: "", qty: "", reasonCode: "", notes: "", status: 'pending' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState<{ [key: string]: boolean }>({});
  const [holdInfo, setHoldInfo] = useState<Record<string, OnHoldCustomer[] | 'loading'>>({});

  const fetchOnHoldCustomers = async (productId: string) => {
    if (!productId || holdInfo[productId]) return;
    setHoldInfo(prev => ({ ...prev, [productId]: 'loading' }));
    try {
      const res = await fetch("/api/inventory/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: 'getOnHoldCustomers', productId })
      });
      const data = await res.json();
      setHoldInfo(prev => ({ ...prev, [productId]: data.customers || [] }));
    } catch {
      setHoldInfo(prev => ({ ...prev, [productId]: [] }));
    }
  };

  useEffect(() => {
    supabase.from("products").select("id, name, variant_name, stock_level").then(({ data }) => {
      if (data) setProducts(data);
    });
  }, []);

  const addRow = () => {
    setRows([...rows, { id: Math.random().toString(), productId: "", qty: "", reasonCode: "", notes: "", status: 'pending' }]);
  };

  const updateRow = (id: string, field: keyof EntryRow, value: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value, status: 'pending' } : r));
    if (field === 'productId' && value) fetchOnHoldCustomers(value);
  };

  const removeRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const handleVerify = async (row: EntryRow) => {
    if (!row.productId || !row.qty) return alert("Please select a product and enter the physical count.");
    
    const product = products.find(p => p.id === row.productId);
    if (!product) return;

    const physicalCount = Number(row.qty);

    try {
      const res = await fetch("/api/inventory/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'verify',
          productId: row.productId,
          physicalCount,
          snapshotTime: new Date(snapshotTime).toISOString()
        })
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      if (data.isMatch) {
        setRows(rows.map(r => r.id === row.id ? { 
          ...r, 
          status: 'success', 
          discrepancyMessage: 'Count matches system exactly! No correction needed.' 
        } : r));
      } else {
        setRows(rows.map(r => r.id === row.id ? { 
          ...r, 
          status: 'error', 
          expectedStock: data.expectedPhysicalStock,
          discrepancyToApply: data.discrepancy,
          discrepancyMessage: `Discrepancy found! At ${new Date(snapshotTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}, expected ${data.expectedPhysicalStock}, you counted ${physicalCount}.` 
        } : r));
      }
    } catch (e: any) {
      alert("Error verifying: " + e.message);
    }
  };

  const handleApplyCorrection = async (row: EntryRow) => {
    if (!row.reasonCode || !row.notes.trim()) {
      return alert("You must select a reason and provide a written explanation for the discrepancy before confirming.");
    }

    const product = products.find(p => p.id === row.productId);
    if (!product) return;

    setIsSubmitting(prev => ({ ...prev, [row.id]: true }));

    try {
      const res = await fetch("/api/inventory/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'apply',
          productId: row.productId,
          physicalCount: Number(row.qty),
          discrepancyToApply: row.discrepancyToApply,
          reasonCode: row.reasonCode,
          notes: row.notes
        })
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      // Update local product state to prevent re-triggering discrepancy if they recount immediately
      setProducts(products.map(p => p.id === product.id ? { ...p, stock_level: data.newStockLevel } : p));

      setRows(rows.map(r => r.id === row.id ? { 
        ...r, 
        status: 'success', 
        discrepancyMessage: 'Stock successfully corrected!' 
      } : r));
    } catch (e: any) {
      alert("Error applying correction: " + e.message);
    } finally {
      setIsSubmitting(prev => ({ ...prev, [row.id]: false }));
    }
  };

  const getDisplayName = (p: Product) => {
    let n = p.name;
    if (p.variant_name) n += ` [${p.variant_name}]`;
    return n;
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 bg-white shadow rounded-lg mt-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Inventory Audit & Correction</h1>
        <p className="text-slate-600">Perform a live physical count. Discrepancies can be corrected instantly.</p>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Snapshot Cut-off Time
        </label>
        <p className="text-xs text-slate-500 mb-2">When was this physical count list printed? The system will calculate expected stock exactly at this moment.</p>
        <input 
          type="datetime-local" 
          className="border border-slate-300 p-2 rounded-md w-full max-w-sm focus:border-indigo-500 outline-none shadow-sm"
          value={snapshotTime}
          onChange={e => setSnapshotTime(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 border-y">
              <th className="p-3 font-semibold text-sm w-4/12">Product</th>
              <th className="p-3 font-semibold text-sm w-2/12">Physical Count</th>
              <th className="p-3 font-semibold text-sm w-3/12">Reason & Notes</th>
              <th className="p-3 font-semibold text-sm w-2/12 text-center">Action</th>
              <th className="p-3 font-semibold text-sm w-1/12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2 align-top">
                  <SearchableSelect 
                    allProducts={products} 
                    value={row.productId} 
                    onChange={v => updateRow(row.id, "productId", v)} 
                    getDisplayName={getDisplayName}
                    disabled={row.status === 'success'}
                  />
                  {row.status === 'error' && (
                    <div className="mt-2 text-xs text-red-600 font-medium bg-red-50 p-2 rounded border border-red-200">
                      {row.discrepancyMessage}
                    </div>
                  )}
                  {row.status === 'success' && row.discrepancyMessage && (
                    <div className="mt-2 text-xs text-emerald-700 font-medium bg-emerald-50 p-2 rounded border border-emerald-200">
                      {row.discrepancyMessage}
                    </div>
                  )}
                  {row.productId && holdInfo[row.productId] && holdInfo[row.productId] !== 'loading' && (holdInfo[row.productId] as OnHoldCustomer[]).length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="mt-2 block">
                          <Badge variant="outline" className="cursor-pointer border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100">
                            Held by {(holdInfo[row.productId] as OnHoldCustomer[]).length} customer(s)
                          </Badge>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 text-sm space-y-2">
                        {(holdInfo[row.productId] as OnHoldCustomer[]).map(c => (
                          <div key={c.orderId} className="border-b last:border-0 pb-2 last:pb-0">
                            <div className="font-medium">{c.customerName}</div>
                            <div className="text-xs text-slate-500">
                              Order #{c.orderId.slice(0, 7).toUpperCase()} · qty {c.quantity}
                              {c.holdSince ? ` · since ${new Date(c.holdSince).toLocaleDateString()}` : ''}
                            </div>
                            {c.holdReason && <div className="text-xs text-slate-600 italic mt-1">&ldquo;{c.holdReason}&rdquo;</div>}
                          </div>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </td>
                <td className="p-2 align-top">
                  <input 
                    type="number" 
                    className="w-full border p-2 rounded-md disabled:bg-slate-50 disabled:text-slate-500" 
                    placeholder="0"
                    value={row.qty}
                    onChange={e => updateRow(row.id, "qty", e.target.value)}
                    disabled={row.status === 'success'}
                  />
                </td>
                <td className="p-2 align-top">
                  {row.status === 'error' ? (
                    <div className="space-y-2">
                      <select 
                        className="w-full border p-2 rounded-md bg-orange-50 border-orange-300 text-orange-900"
                        value={row.reasonCode}
                        onChange={e => updateRow(row.id, "reasonCode", e.target.value)}
                      >
                        <option value="" disabled>-- Select Reason --</option>
                        <option value="Damaged Item">Damaged Item</option>
                        <option value="Lost / Missing">Lost / Missing</option>
                        <option value="Previous Miscount">Previous Miscount</option>
                        <option value="Other">Other</option>
                      </select>
                      <textarea 
                        className="w-full border p-2 rounded-md border-orange-300" 
                        placeholder="Mandatory explanation..."
                        rows={2}
                        value={row.notes}
                        onChange={e => updateRow(row.id, "notes", e.target.value)}
                      />
                    </div>
                  ) : (
                    <input 
                      type="text" 
                      className="w-full border p-2 rounded-md disabled:bg-slate-50 disabled:text-slate-500" 
                      placeholder={row.status === 'success' ? "No notes needed" : "Optional notes"}
                      value={row.notes}
                      onChange={e => updateRow(row.id, "notes", e.target.value)}
                      disabled={row.status === 'success'}
                    />
                  )}
                </td>
                <td className="p-2 align-top text-center">
                  {row.status === 'pending' && (
                    <Button onClick={() => handleVerify(row)} variant="outline" className="w-full text-indigo-700 border-indigo-300 hover:bg-indigo-50">
                      Verify
                    </Button>
                  )}
                  {row.status === 'error' && (
                    <Button 
                      onClick={() => handleApplyCorrection(row)} 
                      disabled={isSubmitting[row.id]}
                      className="w-full bg-red-600 hover:bg-red-700 text-white shadow-sm"
                    >
                      {isSubmitting[row.id] ? "Applying..." : "Confirm Correction"}
                    </Button>
                  )}
                  {row.status === 'success' && (
                    <span className="text-emerald-600 font-bold flex items-center justify-center h-10">
                      ✓ Done
                    </span>
                  )}
                </td>
                <td className="p-2 align-top text-right">
                  <button onClick={() => removeRow(row.id)} className="text-slate-400 hover:text-red-600 font-bold px-2 mt-2">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <Button variant="outline" onClick={addRow} className="w-full border-dashed text-slate-600 hover:text-slate-900 bg-slate-50">
          + Add Another Audit Row
        </Button>
      </div>
    </div>
  );
}

function SearchableSelect({ allProducts, value, onChange, getDisplayName, disabled }: { allProducts: Product[], value: string, onChange: (id: string) => void, getDisplayName: (p: Product) => string, disabled?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedProduct = allProducts.find(p => p.id === value);

  if (!isEditing || disabled) {
    return (
      <div 
        className={`w-full p-2 border rounded-md text-sm truncate ${disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white cursor-pointer hover:border-indigo-400'}`}
        onClick={() => {
          if (!disabled) {
            setIsEditing(true);
            setSearchTerm('');
          }
        }}
      >
        {selectedProduct ? getDisplayName(selectedProduct) : <span className="text-slate-400">Click to search product...</span>}
      </div>
    );
  }

  const filtered = allProducts.filter(p => getDisplayName(p).toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);

  return (
    <div className="relative w-full">
      <input 
        autoFocus
        type="text" 
        className="w-full p-2 border border-indigo-500 rounded-md outline-none text-sm shadow-sm"
        placeholder="Type to search..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        onBlur={() => setTimeout(() => setIsEditing(false), 300)}
      />
      <div className="absolute z-10 w-full mt-1 bg-white border shadow-lg max-h-60 overflow-y-auto rounded-md">
        <div 
           className="p-2 text-sm hover:bg-slate-100 cursor-pointer text-slate-500"
           onPointerDown={(e) => { e.preventDefault(); onChange(''); setIsEditing(false); }}
        >
          -- Clear Selection --
        </div>
        {filtered.map(p => (
          <div 
            key={p.id} 
            className="p-2 text-sm hover:bg-indigo-50 cursor-pointer border-t"
            onPointerDown={(e) => {
              e.preventDefault();
              onChange(p.id);
              setIsEditing(false);
            }}
          >
            {getDisplayName(p)}
          </div>
        ))}
        {filtered.length === 0 && <div className="p-2 text-sm text-slate-500">No products found.</div>}
      </div>
    </div>
  );
}
