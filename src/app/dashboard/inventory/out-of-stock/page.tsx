"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

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
  notes: string;
};

export default function OutOfStockEntry() {
  const [products, setProducts] = useState<Product[]>([]);
  const [snapshotTime, setSnapshotTime] = useState<string>(
    new Date().toISOString().slice(0, 16) // "YYYY-MM-DDThh:mm"
  );
  
  const [rows, setRows] = useState<EntryRow[]>([
    { id: Math.random().toString(), productId: "", qty: "", notes: "" }
  ]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/inventory/out-of-stock/summary");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.summary || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSummary();
    supabase.from("products").select("id, name, variant_name, stock_level").then(({ data }) => {
      if (data) setProducts(data);
    });
  }, []);

  const addRow = () => {
    setRows([...rows, { id: Math.random().toString(), productId: "", qty: "", notes: "" }]);
  };

  const updateRow = (id: string, field: keyof EntryRow, value: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const handleSubmit = async () => {
    const validRows = rows.filter(r => r.productId && r.qty);
    if (validRows.length === 0) return alert("Please add at least one valid item.");
    if (!snapshotTime) return alert("Please select a snapshot time.");

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory/out-of-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotTime: new Date(snapshotTime).toISOString(),
          items: validRows.map(r => ({
            productId: r.productId,
            reportedQty: Number(r.qty),
            notes: r.notes
          }))
        })
      });

      if (!res.ok) throw new Error(await res.text());

      alert("Successfully submitted for verification!");
      setRows([{ id: Math.random().toString(), productId: "", qty: "", notes: "" }]);
      fetchSummary();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSubmitting(false);
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
        <h1 className="text-3xl font-bold text-slate-800">Out of Stock Entry</h1>
        <p className="text-slate-600">Encode the physical out-of-stock list from the warehouse.</p>
      </div>

      <div className="p-4 bg-slate-50 border rounded-lg">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Snapshot Cut-off Time
        </label>
        <p className="text-xs text-slate-500 mb-2">When was this list created? The system will calculate expected stock exactly at this moment.</p>
        <input 
          type="datetime-local" 
          className="border p-2 rounded-md w-full max-w-sm"
          value={snapshotTime}
          onChange={e => setSnapshotTime(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 border-y">
              <th className="p-3 font-semibold text-sm w-5/12">Product</th>
              <th className="p-3 font-semibold text-sm w-2/12">Needed Qty</th>
              <th className="p-3 font-semibold text-sm w-4/12">Notes if needed</th>
              <th className="p-3 font-semibold text-sm w-1/12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className="border-b">
                <td className="p-2">
                  <SearchableSelect 
                    allProducts={products} 
                    value={row.productId} 
                    onChange={v => updateRow(row.id, "productId", v)} 
                    getDisplayName={getDisplayName}
                  />
                </td>
                <td className="p-2">
                  <input 
                    type="number" 
                    min="1"
                    className="w-full border p-2 rounded-md" 
                    placeholder="Qty"
                    value={row.qty}
                    onChange={e => updateRow(row.id, "qty", e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <input 
                    type="text" 
                    className="w-full border p-2 rounded-md" 
                    placeholder="e.g. layaway, customer waiting"
                    value={row.notes}
                    onChange={e => updateRow(row.id, "notes", e.target.value)}
                  />
                </td>
                <td className="p-2 text-right">
                  <button onClick={() => removeRow(row.id)} className="text-red-500 hover:text-red-700 font-bold px-2">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <Button variant="outline" onClick={addRow} className="w-full border-dashed text-slate-600 hover:text-slate-900">
          + Add Another Product
        </Button>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-2">
          {isSubmitting ? "Submitting..." : "Submit for Verification"}
        </Button>
      </div>

      {history.length > 0 && (
        <div className="pt-12">
          <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">Live Out of Stock Summary (Procurement List)</h2>
          <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">OS Qty (Needed)</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-700">
                {history.map((h, i) => (
                  <tr key={h.productId || i} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-900">{h.productName}</td>
                    <td className="p-3 font-bold text-slate-800">{h.qty}</td>
                    <td className="p-3 text-slate-500 italic">{h.notes || '-'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        h.status === 'Pending Verification' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                        'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {h.status === 'Pending Verification' ? '🟠 ' : '🟢 '}{h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableSelect({ allProducts, value, onChange, getDisplayName }: { allProducts: Product[], value: string, onChange: (id: string) => void, getDisplayName: (p: Product) => string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedProduct = allProducts.find(p => p.id === value);

  if (!isEditing) {
    return (
      <div 
        className="w-full p-2 border rounded-md bg-white cursor-pointer hover:border-indigo-400 text-sm truncate"
        onClick={() => {
          setIsEditing(true);
          setSearchTerm('');
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
        className="w-full p-2 border border-indigo-500 rounded-md outline-none text-sm"
        placeholder="Type to search..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        onBlur={() => setTimeout(() => setIsEditing(false), 250)}
      />
      <div className="absolute z-10 w-full mt-1 bg-white border shadow-lg max-h-60 overflow-y-auto rounded-md">
        <div 
           className="p-2 text-sm hover:bg-slate-100 cursor-pointer text-slate-500"
           onMouseDown={(e) => { e.preventDefault(); onChange(''); setIsEditing(false); }}
        >
          -- Clear Selection --
        </div>
        {filtered.map(p => (
          <div 
            key={p.id} 
            className="p-2 text-sm hover:bg-indigo-50 cursor-pointer border-t"
            onMouseDown={(e) => {
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
