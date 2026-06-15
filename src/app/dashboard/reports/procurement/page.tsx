"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function ProcurementSheet() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [groupedItems, setGroupedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State to hold user input for purchases
  const [purchases, setPurchases] = useState<Record<string, {qty: string, cost: string, supplierId: string}>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/inventory/procurement");
      const data = await res.json();
      setSuppliers(data.suppliers || []);
      setGroupedItems(data.groupedOutofStock || []);
      
      const initialPurchases: Record<string, any> = {};
      (data.groupedOutofStock || []).forEach((group: any) => {
        group.items.forEach((item: any) => {
          initialPurchases[item.productId] = {
            qty: String(item.neededQty), // Pre-fill with Jasmin's request or system qty
            cost: item.unitCost || '',
            supplierId: item.supplierId || '',
            draftItemId: item.draftItemId || null
          };
        });
      });
      setPurchases(initialPurchases);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdatePurchase = (productId: string, field: string, value: string) => {
    setPurchases(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };

  const handleAssignSupplier = async (productId: string, newSupplierId: string) => {
    if (!newSupplierId) return;
    try {
      await supabase.from('products').update({ supplier_id: newSupplierId }).eq('id', productId);
      // Reload to re-group
      fetchData();
    } catch (e) {
      alert("Failed to assign supplier.");
    }
  };

  const handleSubmitPurchases = async () => {
    // Filter only items that have a quantity entered
    const validPurchases = Object.entries(purchases)
      .filter(([_, data]) => data.qty && Number(data.qty) > 0)
      .map(([productId, data]) => ({
        productId,
        qty: Number(data.qty),
        cost: Number(data.cost || 0),
        supplierId: data.supplierId,
        draftItemId: data.draftItemId
      }));

    if (validPurchases.length === 0) {
      return alert("Please enter a purchased quantity for at least one item.");
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchases: validPurchases })
      });

      if (!res.ok) throw new Error(await res.text());

      alert("Successfully recorded purchases as Pending Purchase Orders!");
      // Clear inputs
      setPurchases({});
      fetchData();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading Procurement Sheet...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 bg-white shadow rounded-lg mt-8">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Procurement Master Sheet</h1>
          <p className="text-slate-600">Your confidential shopping list. Enter what you bought and it will be sent to Jasmin as a Pending Shipment.</p>
        </div>
        <Button onClick={handleSubmitPurchases} disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-2">
          {isSubmitting ? "Recording..." : "Record Purchases"}
        </Button>
      </div>

      {groupedItems.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border rounded-lg text-slate-500">
          No items currently out of stock!
        </div>
      ) : (
        <div className="space-y-10">
          {groupedItems.map(group => (
            <div key={group.id || 'unassigned'} className="border rounded-lg overflow-hidden shadow-sm">
              <div className={`px-4 py-3 border-b ${group.id === null ? 'bg-orange-100' : 'bg-slate-100'}`}>
                <h2 className="text-xl font-bold text-slate-800">{group.name}</h2>
              </div>
              
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b">
                  <tr>
                    <th className="p-3 w-1/4">Product Name</th>
                    <th className="p-3 w-[10%] text-center leading-tight">System<br/>Needed</th>
                    <th className="p-3 w-[10%] text-center leading-tight">Jasmin's<br/>Request</th>
                    <th className="p-3 w-2/12">Actual Supplier</th>
                    <th className="p-3 w-2/12">Unit Cost (₱)</th>
                    <th className="p-3 w-2/12">Final Qty Bought</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-700">
                  {group.items.map((item: any) => {
                    const pState = purchases[item.productId] || { qty: '', cost: item.unitCost || '', supplierId: item.supplierId || '', draftItemId: null };
                    
                    const hasDiscrepancy = item.jasminRequestedQty !== null && item.systemQty !== item.jasminRequestedQty;

                    return (
                      <tr key={item.productId} className={hasDiscrepancy ? "bg-orange-50 hover:bg-orange-100" : "hover:bg-slate-50"}>
                        <td className="p-3 font-medium text-slate-900">
                          {item.productName}
                          {hasDiscrepancy && (
                              <div className="text-xs font-bold text-orange-600 mt-1">
                                  ⚠️ Discrepancy detected. Ask Jasmin for reason.
                              </div>
                          )}
                          {group.id === null && (
                            <div className="mt-2">
                              <select 
                                className="text-xs border rounded p-1 text-slate-500 bg-white"
                                onChange={(e) => handleAssignSupplier(item.productId, e.target.value)}
                                defaultValue=""
                              >
                                <option value="" disabled>Assign Default Supplier...</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-500 text-center text-lg">{item.systemQty}</td>
                        <td className={`p-3 font-bold text-center text-lg ${hasDiscrepancy ? "text-orange-600" : "text-green-600"}`}>
                            {item.jasminRequestedQty !== null ? item.jasminRequestedQty : <span className="text-xs text-slate-400 font-normal">Pending</span>}
                        </td>
                        <td className="p-3">
                          <select 
                            className="w-full border p-2 rounded-md"
                            value={pState.supplierId}
                            onChange={(e) => handleUpdatePurchase(item.productId, 'supplierId', e.target.value)}
                          >
                            <option value="">-- No Supplier --</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            className="w-full border p-2 rounded-md" 
                            placeholder="0.00"
                            value={pState.cost}
                            onChange={(e) => handleUpdatePurchase(item.productId, 'cost', e.target.value)}
                          />
                        </td>
                        <td className="p-3 bg-indigo-50/50">
                          <input 
                            type="number" 
                            className="w-full border border-indigo-300 p-2 rounded-md focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-900" 
                            placeholder="Qty Bought"
                            value={pState.qty}
                            onChange={(e) => handleUpdatePurchase(item.productId, 'qty', e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
