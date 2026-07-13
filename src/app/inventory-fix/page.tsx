"use client";

import { useState } from 'react';
import initialData from './data.json';
import { Button } from "@/components/ui/button";

export default function InventoryFixPage() {
  const { allDbProducts, mappedItems: initialMapped, unmappedNegativeDbItems: initialUnmappedDb, gerardoDeductions } = initialData;

  const [mappedItems, setMappedItems] = useState(() => 
    initialMapped.map((item: any) => ({
      ...item,
      // If rating is < 0.4, default it to unassigned
      matchedDbId: item.rating < 0.4 ? '' : item.matchedDbId
    }))
  );

  const [saving, setSaving] = useState(false);

  // Group UI
  const matchedExcelItems = mappedItems.filter((m: any) => m.matchedDbId !== '');
  const unmatchedExcelItems = mappedItems.filter((m: any) => m.matchedDbId === '');

  // Calculate used DB IDs
  const usedDbIds = new Set(mappedItems.filter((m: any) => m.matchedDbId !== '').map((m: any) => m.matchedDbId));

  const updateMapping = (itemId: string, newDbId: string) => {
    setMappedItems(prev => prev.map((m: any) => m.id === itemId ? { ...m, matchedDbId: newDbId } : m));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const adjustments: { dbId: string; targetStock: number }[] = [];

      for (const m of mappedItems) {
        if (m.matchedDbId) {
          const gerardoQty = (gerardoDeductions as any)[m.matchedDbId] || 0;
          const targetStock = -m.neededQty - gerardoQty;
          adjustments.push({ dbId: m.matchedDbId, targetStock });
        }
      }

      for (const u of initialUnmappedDb) {
        if (!usedDbIds.has(u.dbId as any)) {
          const gerardoQty = (gerardoDeductions as any)[u.dbId] || 0;
          const targetStock = 0 - gerardoQty;
          adjustments.push({ dbId: u.dbId, targetStock });
        }
      }

      const res = await fetch('/api/inventory-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustments })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      alert('Inventory successfully updated!');
    } catch (e: any) {
      alert('Error saving: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper formatting for product names
  const getProductDisplayName = (p: any) => {
    let name = p.name;
    if (p.variant_name) name += ` [Variation: ${p.variant_name}]`;
    name += ` (Current Stock: ${p.stock_level})`;
    return name;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12">
      <datalist id="product-options">
        {allDbProducts.map((p: any) => (
          <option key={p.id} value={p.id}>{getProductDisplayName(p)}</option>
        ))}
      </datalist>

      <div>
        <h1 className="text-3xl font-bold text-slate-800">Inventory Reconciliation Tool</h1>
        <p className="text-slate-600 mt-2">
          Match your Excel &quot;Out of Stock&quot; items to the correct database products.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">Action Needed</span> 
          Unmatched Excel Items ({unmatchedExcelItems.length})
        </h2>
        <p className="text-sm text-slate-500 mb-4">These items had very low confidence matches. Please select their database equivalent, or ignore them if they shouldn&apos;t be matched.</p>
        <div className="border rounded-md overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-3 text-sm font-semibold">Excel Name</th>
                <th className="p-3 text-sm font-semibold">Needed Qty</th>
                <th className="p-3 text-sm font-semibold w-1/2">Map to Database Product</th>
              </tr>
            </thead>
            <tbody>
              {unmatchedExcelItems.map((m: any) => (
                <tr key={m.id} className="border-b bg-red-50/50">
                  <td className="p-3 font-medium text-slate-700">{m.excelName}</td>
                  <td className="p-3">{m.neededQty}</td>
                  <td className="p-3">
                    <SearchableSelect 
                       allProducts={allDbProducts} 
                       value={m.matchedDbId} 
                       onChange={(newId) => updateMapping(m.id, newId)} 
                       getDisplayName={getProductDisplayName}
                    />
                  </td>
                </tr>
              ))}
              {unmatchedExcelItems.length === 0 && (
                <tr><td colSpan={3} className="p-4 text-center text-slate-500">All Excel items have a matched product!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">Ready</span> 
          Matched Items ({matchedExcelItems.length})
        </h2>
        <div className="border rounded-md overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-3 text-sm font-semibold">Excel Name</th>
                <th className="p-3 text-sm font-semibold w-1/3">Mapped DB Product</th>
                <th className="p-3 text-sm font-semibold">Needed Qty</th>
                <th className="p-3 text-sm font-semibold">Final DB Stock (incl. Gerardo)</th>
              </tr>
            </thead>
            <tbody>
              {matchedExcelItems.map((m: any) => {
                const gerardoQty = (gerardoDeductions as any)[m.matchedDbId] || 0;
                const finalStock = -m.neededQty - gerardoQty;
                return (
                  <tr key={m.id} className="border-b">
                    <td className="p-3 text-slate-700">{m.excelName}</td>
                    <td className="p-3">
                      <SearchableSelect 
                         allProducts={allDbProducts} 
                         value={m.matchedDbId} 
                         onChange={(newId) => updateMapping(m.id, newId)} 
                         getDisplayName={getProductDisplayName}
                      />
                    </td>
                    <td className="p-3">{m.neededQty}</td>
                    <td className="p-3 font-bold">{finalStock}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end p-4 bg-slate-50 rounded-lg border">
        <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded">
          {saving ? 'Saving...' : 'Execute Database Fix'}
        </Button>
      </div>
    </div>
  );
}

function SearchableSelect({ allProducts, value, onChange, getDisplayName }: { allProducts: any[], value: string, onChange: (id: string) => void, getDisplayName: (p: any) => string }) {
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
        {selectedProduct ? getDisplayName(selectedProduct) : <span className="text-slate-400">-- Click to search & select --</span>}
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
        placeholder="Type to search products..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        onBlur={() => {
           setTimeout(() => setIsEditing(false), 300);
        }}
      />
      <div className="absolute z-10 w-full mt-1 bg-white border shadow-lg max-h-60 overflow-y-auto rounded-md">
        <div 
           className="p-2 text-sm hover:bg-slate-100 cursor-pointer text-slate-500"
           onPointerDown={(e) => { 
             e.preventDefault(); 
             onChange(''); 
             setIsEditing(false); 
           }}
        >
          -- Remove Mapping --
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
