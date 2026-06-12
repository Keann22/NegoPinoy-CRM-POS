"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function DiscrepanciesReport() {
  const [items, setItems] = useState<any[]>([]);
  const [unreported, setUnreported] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const res = await fetch("/api/inventory/verify");
      const data = await res.json();
      setItems(data.pendingItems || []);
      setUnreported(data.unreportedNegativeStock || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleAction = async (item: any, action: 'approve' | 'reject') => {
    if (action === 'approve' && item.discrepancy !== 0) {
      if (!confirm(`This will permanently apply a discrepancy adjustment of ${item.discrepancy} to the live stock. Are you sure?`)) {
        return;
      }
    }

    try {
      const res = await fetch("/api/inventory/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          action,
          productId: item.productId,
          discrepancyToApply: item.discrepancy,
          notes: item.notes
        })
      });

      if (!res.ok) throw new Error(await res.text());

      // Remove from list
      setItems(items.filter(i => i.id !== item.id));
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleZeroOut = async (item: any) => {
    if (!confirm(`This will permanently reset ${item.productName}'s stock from ${item.stockLevel} to 0. Are you sure?`)) {
      return;
    }

    try {
      const res = await fetch("/api/inventory/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: 'unreported', // Dummy ID since it's not a pending report item
          action: 'zero_out',
          productId: item.id,
          discrepancyToApply: item.stockLevel // send the negative amount
        })
      });

      if (!res.ok) throw new Error(await res.text());

      // Remove from list
      setUnreported(unreported.filter(i => i.id !== item.id));
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleAcknowledge = async (item: any) => {
    try {
      const res = await fetch("/api/inventory/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: 'unreported', 
          action: 'acknowledge',
          productId: item.id,
          discrepancyToApply: 0
        })
      });

      if (!res.ok) throw new Error(await res.text());

      // Remove from list
      setUnreported(unreported.filter(i => i.id !== item.id));
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading pending reports...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 bg-white shadow rounded-lg mt-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Out of Stock Verification</h1>
        <p className="text-slate-600">Review and reconcile physical stock counts encoded by staff.</p>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border rounded-lg text-slate-500">
          No pending out-of-stock reports to verify!
        </div>
      ) : (
        <div className="space-y-6">
          {items.map(item => {
            const hasDiscrepancy = item.discrepancy !== 0;
            return (
              <div key={item.id} className={`border rounded-lg p-6 ${hasDiscrepancy ? 'bg-red-50/30 border-red-200' : 'bg-green-50/30 border-green-200'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{item.productName}</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Snapshot Taken: {format(new Date(item.snapshotTime), "PPpp")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleAction(item, 'reject')} className="text-slate-600 hover:bg-slate-100">
                      Reject
                    </Button>
                    <Button onClick={() => handleAction(item, 'approve')} className={hasDiscrepancy ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}>
                      {hasDiscrepancy ? 'Approve Adjustment' : 'Verify Match'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mt-2">
                  <div className="p-3 bg-white rounded border shadow-sm">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Reported Needed</p>
                    <p className="text-2xl font-bold text-slate-800">{item.reportedQty}</p>
                    <p className="text-xs text-slate-400 mt-1">Physical Stock: {item.physicalStockAtSnapshot}</p>
                  </div>
                  
                  <div className="p-3 bg-white rounded border shadow-sm">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Expected Stock</p>
                    <p className="text-2xl font-bold text-slate-800">{item.expectedStockAtSnapshot}</p>
                    <p className="text-xs text-slate-400 mt-1">Time-traveled to snapshot</p>
                  </div>

                  <div className={`p-3 rounded border shadow-sm ${hasDiscrepancy ? 'bg-red-100 border-red-300' : 'bg-green-100 border-green-300'}`}>
                    <p className={`text-xs uppercase tracking-wider font-semibold ${hasDiscrepancy ? 'text-red-700' : 'text-green-700'}`}>
                      Discrepancy
                    </p>
                    <p className={`text-2xl font-bold ${hasDiscrepancy ? 'text-red-800' : 'text-green-800'}`}>
                      {item.discrepancy > 0 ? `+${item.discrepancy}` : item.discrepancy}
                    </p>
                    <p className={`text-xs mt-1 ${hasDiscrepancy ? 'text-red-600' : 'text-green-600'}`}>
                      {hasDiscrepancy ? 'System is out of sync' : 'Perfect match!'}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-800 rounded border shadow-sm text-white">
                    <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Live Stock</p>
                    <p className="text-2xl font-bold">{item.currentStock}</p>
                    <p className="text-xs text-slate-400 mt-1">Current total</p>
                  </div>
                </div>

                {item.notes && (
                  <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded text-sm">
                    <span className="font-bold">Staff Note:</span> {item.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unreported.length > 0 && (
        <div className="pt-12">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Unreported Negative Stock</h2>
          <p className="text-slate-600 mb-6">The CRM indicates these items are out of stock, but staff did not report them in the latest physical count.</p>
          
          <div className="bg-white border rounded-lg overflow-hidden shadow-sm border-orange-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-orange-50 text-orange-800 border-b border-orange-200">
                <tr>
                  <th className="p-4 w-1/2">Product Name</th>
                  <th className="p-4 w-1/4 text-center">Live Stock</th>
                  <th className="p-4 w-1/4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-700">
                {unreported.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-4 font-medium text-slate-900">{item.productName}</td>
                    <td className="p-4 text-center font-bold text-red-600">{item.stockLevel}</td>
                    <td className="p-4 text-right space-x-2">
                      <Button onClick={() => handleAcknowledge(item)} variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-100">
                        Mark as Out of Stock
                      </Button>
                      <Button onClick={() => handleZeroOut(item)} variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100">
                        Zero Out Stock
                      </Button>
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
