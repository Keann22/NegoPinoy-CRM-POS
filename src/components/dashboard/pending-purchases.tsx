"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export function PendingPurchases({ onReceiveComplete }: { onReceiveComplete: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPending = async () => {
    try {
      const res = await fetch("/api/inventory/receive/pending-pos");
      const data = await res.json();
      setItems(data.pendingItems || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleQtyChange = (id: string, qty: string) => {
    setItems(items.map(i => i.id === id ? { ...i, receivedQty: qty } : i));
  };

  const handleReceive = async () => {
    // filter out items that have receivedQty entered
    const toReceive = items.filter(i => i.receivedQty && Number(i.receivedQty) > 0).map(i => ({
      itemId: i.id,
      receivedQty: Number(i.receivedQty)
    }));

    if (toReceive.length === 0) {
      return alert("Please enter the received quantity for at least one item.");
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory/receive/pending-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receives: toReceive })
      });

      if (!res.ok) throw new Error(await res.text());

      alert("Successfully received pending purchases!");
      fetchPending();
      onReceiveComplete();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div>Loading pending purchases...</div>;
  if (items.length === 0) return null; // Hide completely if nothing pending

  return (
    <Card className="mb-6 border-indigo-200 shadow-md">
      <CardHeader className="bg-indigo-50/50 pb-4 border-b">
        <CardTitle className="text-xl text-indigo-900">Pending Purchases to Receive</CardTitle>
        <CardDescription>Items recently purchased by Management that are waiting to be received into inventory.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b">
            <tr>
              <th className="p-4 w-1/2">Product Name</th>
              <th className="p-4 w-1/4 text-center">Purchased Qty</th>
              <th className="p-4 w-1/4">Received Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="p-4 font-medium text-slate-900">{item.productName}</td>
                <td className="p-4 text-center font-bold text-slate-600">{item.expectedQty}</td>
                <td className="p-4">
                  <Input 
                    type="number" 
                    placeholder={`Matches ${item.expectedQty}?`}
                    value={item.receivedQty || ''}
                    onChange={(e) => handleQtyChange(item.id, e.target.value)}
                    className="border-indigo-200 focus-visible:ring-indigo-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div className="p-4 border-t flex justify-end bg-slate-50">
          <Button onClick={handleReceive} disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Receive Checked Items
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
