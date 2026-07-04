"use client";

import { Fragment } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2 } from "lucide-react";
import { usePendingPurchases } from "@/hooks/usePendingPurchases";
import { PendingProductSearch } from "@/components/dashboard/inventory/pending-product-search";

export function PendingPurchases({ onReceiveComplete }: { onReceiveComplete: () => void }) {
  const {
    items,
    setItems,
    unexpectedItems,
    setUnexpectedItems,
    loading,
    isSubmitting,
    submittingId,
    handleQtyChange,
    handleReasonChange,
    handleReceiveSingle,
    handleCancel,
    handleReceive,
    closeBatch
  } = usePendingPurchases(onReceiveComplete);

  if (loading) return <div>Loading pending purchases...</div>;
  
  if (items.length === 0 && unexpectedItems.length === 0) {
      return (
          <div className="mb-6 flex justify-end">
              <PendingProductSearch onProductSelect={(p) => {
                  if (!unexpectedItems.find(x => x.id === p.id)) {
                      setUnexpectedItems([...unexpectedItems, { ...p, receivedQty: '' }]);
                  }
              }} />
          </div>
      );
  }

  return (
    <Card className="mb-6 border-indigo-200 shadow-md">
      <CardHeader className="bg-indigo-50/50 pb-4 border-b">
        <CardTitle className="text-xl text-indigo-900">Pending Incoming Items</CardTitle>
        <CardDescription>Items recently purchased by Management or requested by Staff that are waiting to be received into inventory.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b">
            <tr>
              <th className="p-4 w-1/2">Product Name</th>
              <th className="p-4 w-1/4 text-center">Expected Qty</th>
              <th className="p-4 w-1/4">Received Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {Object.entries(
                items.reduce((acc, item) => {
                    const batch = item.batchName || 'Unknown Batch';
                    if (!acc[batch]) acc[batch] = [];
                    acc[batch].push(item);
                    return acc;
                }, {} as Record<string, any[]>)
            ).map(([batchName, batchItems]: [string, any]) => (
                <Fragment key={batchName}>
                    <tr className="bg-slate-100">
                        <td colSpan={3} className="p-2">
                            <div className="flex justify-between items-center w-full">
                                <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                                    {batchName.replace(/_/g, ' ')}
                                </span>
                                {batchName.startsWith('BATCH_') && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs bg-white text-slate-600 hover:bg-red-50 hover:text-red-700"
                                        onClick={() => closeBatch(batchName)}
                                    >
                                        Close Batch & Rollover
                                    </Button>
                                )}
                            </div>
                        </td>
                    </tr>
                    {batchItems.map((item: any) => {
                      const isDiscrepancy = item.receivedQty && Number(item.receivedQty) > 0 && Number(item.receivedQty) < Number(item.remainingQty);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-4 font-medium text-slate-900">
                              {item.productName}
                              {isDiscrepancy && (
                                  <div className="mt-2">
                                      <Input 
                                        placeholder="Why is there a discrepancy? (e.g. Missing 2 items)"
                                        value={item.discrepancyReason || ''}
                                        onChange={(e) => handleReasonChange(item.id, e.target.value)}
                                        className="border-red-200 focus-visible:ring-red-500 bg-red-50 text-xs h-8"
                                      />
                                  </div>
                              )}
                          </td>
                          <td className="p-4 text-center font-bold text-slate-600">
                              {item.remainingQty}
                              {item.alreadyReceivedQty > 0 && (
                                  <div className="text-xs font-normal text-slate-400 mt-1">({item.alreadyReceivedQty} prev. received)</div>
                              )}
                          </td>
                          <td className="p-4 flex items-center gap-2">
                            <Input 
                              type="number" 
                              placeholder={`Matches ${item.remainingQty}?`}
                              value={item.receivedQty || ''}
                              onChange={(e) => handleQtyChange(item.id, e.target.value)}
                              className={isDiscrepancy ? "border-red-300" : "border-indigo-200 focus-visible:ring-indigo-500"}
                            />
                            <Button 
                                type="button" 
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                                onClick={() => handleReceiveSingle(item, false)}
                                disabled={submittingId === item.id}
                            >
                                {submittingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 px-2"
                                onClick={() => handleCancel(item)}
                                disabled={submittingId === item.id}
                                title="Cancel this request"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
            ))}

            {/* Unexpected Items */}
            {unexpectedItems.length > 0 && (
                <tr className="bg-amber-50/50">
                    <td colSpan={3} className="p-2 text-xs font-semibold text-amber-800 uppercase tracking-wider bg-amber-100/50">
                        Unexpected Items (Not in Purchase Order)
                    </td>
                </tr>
            )}
            {unexpectedItems.map(item => (
                <tr key={`unexpected-${item.id}`} className="hover:bg-amber-50">
                  <td className="p-4 font-medium text-slate-900">
                      {item.name}
                      <div className="text-xs text-amber-600 mt-1">Added manually to delivery</div>
                  </td>
                  <td className="p-4 text-center font-bold text-slate-400">-</td>
                  <td className="p-4 flex gap-2">
                    <Input 
                      type="number" 
                      placeholder={`Qty`}
                      value={item.receivedQty || ''}
                      onChange={(e) => {
                          setUnexpectedItems(unexpectedItems.map(i => i.id === item.id ? { ...i, receivedQty: e.target.value } : i));
                      }}
                      className="border-amber-200 focus-visible:ring-amber-500"
                    />
                    <Button 
                        type="button" 
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                        onClick={() => handleReceiveSingle(item, true)}
                        disabled={submittingId === item.id}
                    >
                        {submittingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setUnexpectedItems(unexpectedItems.filter(i => i.id !== item.id))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
        
        <div className="p-4 border-t flex justify-between bg-slate-50 items-center">
          <div className="w-[250px]">
              <PendingProductSearch onProductSelect={(p) => {
                  if (!unexpectedItems.find(x => x.id === p.id)) {
                      setUnexpectedItems([...unexpectedItems, { ...p, receivedQty: '' }]);
                  }
              }} />
          </div>
          <div className="flex gap-2">
            <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                    setItems(items.map(i => ({ ...i, receivedQty: i.remainingQty.toString() })));
                }}
            >
                Auto-Fill Expected
            </Button>
            <Button onClick={handleReceive} disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Receive Checked Items
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
