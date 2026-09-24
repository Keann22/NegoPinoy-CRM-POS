'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, History, ShieldAlert, ShoppingBag, Package, Calendar, User, ArrowDown, ArrowUp } from 'lucide-react';
import { format } from 'date-fns';

interface AlertReviewTrailDialogProps {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AlertReviewTrailDialog({ productId, open, onOpenChange }: AlertReviewTrailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    product: any;
    movements: any[];
    guardianMemories: any[];
    activeOrders: any[];
  } | null>(null);

  useEffect(() => {
    if (!productId || !open) {
      setData(null);
      return;
    }

    let isMounted = true;
    const loadDeepTrail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/inventory/guardian/alert-review?productId=${productId}`);
        const json = await res.json();
        if (json.success && isMounted) {
          setData(json);
        }
      } catch (err) {
        console.error('Failed to load deep trail:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDeepTrail();
    return () => {
      isMounted = false;
    };
  }, [productId, open]);

  const p = data?.product;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[780px] max-h-[88vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b bg-slate-50 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" />
                Inventory & Audit Trail
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Full chronological paper trail of ledger movements, physical counts, and guardian alerts.
              </DialogDescription>
            </div>
            {p && (
              <div className="text-right shrink-0">
                <span className="text-xs text-muted-foreground block">Current Ledger Stock</span>
                <span className={`text-base font-extrabold ${p.stock_level < 0 ? 'text-rose-600' : p.stock_level === 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {p.stock_level ?? 0} pcs
                </span>
              </div>
            )}
          </div>

          {p && (
            <div className="mt-3 flex items-center gap-3 bg-white p-2.5 rounded-md border text-xs">
              {p.images?.[0] ? (
                <img src={p.images[0]} alt={p.name} className="w-10 h-10 object-cover rounded border shrink-0" />
              ) : (
                <div className="w-10 h-10 bg-slate-100 rounded border flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-slate-900 truncate">
                  {p.name} {p.variant_name && !p.name.includes(p.variant_name) ? `[${p.variant_name}]` : ''}
                </h4>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground mt-0.5 font-mono text-[11px]">
                  <span>SKU: {p.sku || 'N/A'}</span>
                  <span>Shelf: <strong className="text-slate-800">{p.shelf_location || '-'}</strong></span>
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
              <p className="text-xs">Loading complete audit history & movements...</p>
            </div>
          ) : !data ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Failed to load product history.
            </div>
          ) : (
            <Tabs defaultValue="movements" className="w-full">
              <TabsList className="grid grid-cols-3 mb-4 h-9">
                <TabsTrigger value="movements" className="text-xs flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Stock Movements ({data.movements.length})
                </TabsTrigger>
                <TabsTrigger value="guardian" className="text-xs flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Guardian Alerts & Audits ({data.guardianMemories.length})
                </TabsTrigger>
                <TabsTrigger value="orders" className="text-xs flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Active Orders ({data.activeOrders.length})
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Stock Movements */}
              <TabsContent value="movements" className="space-y-2 mt-0">
                {data.movements.length === 0 ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">No ledger movements recorded for this item.</p>
                ) : (
                  <div className="border rounded-md divide-y overflow-hidden text-xs">
                    {data.movements.map((m: any) => {
                      const qty = Number(m.quantity_change) || 0;
                      const isPositive = qty > 0;
                      const isZero = qty === 0;

                      return (
                        <div key={m.id} className="p-3 hover:bg-slate-50 transition-colors flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            isPositive ? 'bg-emerald-100 text-emerald-700' : isZero ? 'bg-slate-100 text-slate-600' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {isPositive ? <ArrowUp className="h-4 w-4" /> : isZero ? <span className="font-bold text-[10px]">0</span> : <ArrowDown className="h-4 w-4" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-800 capitalize">
                                {m.movement_type?.replace(/_/g, ' ') || 'Movement'}
                              </span>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {m.timestamp ? format(new Date(m.timestamp), 'MMM d, yyyy h:mm a') : '-'}
                              </span>
                            </div>

                            <p className="text-slate-600 mt-0.5 font-normal leading-relaxed">
                              {m.reason || 'No description provided'}
                            </p>

                            {m.supplier_name && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                Supplier: <strong>{m.supplier_name}</strong> {m.unit_cost ? `(₱${Number(m.unit_cost).toFixed(2)})` : ''}
                              </p>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`font-mono font-bold text-sm ${isPositive ? 'text-emerald-600' : isZero ? 'text-slate-600' : 'text-rose-600'}`}>
                              {isPositive ? `+${qty}` : qty}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Tab 2: Guardian Alerts & Audits */}
              <TabsContent value="guardian" className="space-y-2 mt-0">
                {data.guardianMemories.length === 0 ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">No guardian memory entries found.</p>
                ) : (
                  <div className="border rounded-md divide-y overflow-hidden text-xs">
                    {data.guardianMemories.map((gm: any) => {
                      const isAlert = gm.action_type === 'anomaly_notified';
                      const isAudit = gm.action_type === 'physical_count_audit';

                      return (
                        <div key={gm.id} className="p-3 hover:bg-slate-50 transition-colors flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            isAlert ? 'bg-amber-100 text-amber-700' : isAudit ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isAlert ? <ShieldAlert className="h-4 w-4" /> : <User className="h-4 w-4" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={isAlert ? 'outline' : 'secondary'} className="text-[10px] uppercase font-bold py-0 h-4">
                                  {isAlert ? 'Telegram Alert' : isAudit ? 'Staff Shelf Audit' : gm.action_type}
                                </Badge>
                                <span className="font-semibold text-slate-800">
                                  {gm.actor_name || (isAlert ? 'System' : 'Staff')}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {gm.created_at ? format(new Date(gm.created_at), 'MMM d, yyyy h:mm a') : '-'}
                              </span>
                            </div>

                            <p className="text-slate-600 mt-1 font-normal">
                              {gm.notes || '-'}
                            </p>

                            {typeof gm.physical_count === 'number' && (
                              <p className="text-[11px] font-semibold text-indigo-600 mt-1">
                                Verified Physical Count on Shelf: {gm.physical_count} pcs
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Tab 3: Active Orders */}
              <TabsContent value="orders" className="space-y-2 mt-0">
                {data.activeOrders.length === 0 ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">No open unfulfilled orders currently reserving this product.</p>
                ) : (
                  <div className="border rounded-md overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b text-slate-500 font-medium">
                        <tr>
                          <th className="p-2.5">Order ID</th>
                          <th className="p-2.5">Customer</th>
                          <th className="p-2.5 text-center">Status</th>
                          <th className="p-2.5 text-center">Payment</th>
                          <th className="p-2.5 text-right">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-slate-700">
                        {data.activeOrders.map((ao: any) => {
                          const o = ao.orders;
                          const isLayaway = o?.payment_method === 'Lay-away';

                          return (
                            <tr key={ao.id} className="hover:bg-slate-50">
                              <td className="p-2.5 font-mono text-[11px] font-medium text-indigo-600">
                                #{o?.id ? o.id.slice(0, 8).toUpperCase() : '-'}
                              </td>
                              <td className="p-2.5 font-medium text-slate-900">
                                {o?.customers?.full_name || 'Walk-in Customer'}
                              </td>
                              <td className="p-2.5 text-center">
                                <Badge variant="outline" className="text-[10px] py-0">
                                  {o?.status || 'Unknown'}
                                </Badge>
                              </td>
                              <td className="p-2.5 text-center">
                                <Badge variant={isLayaway ? 'secondary' : 'outline'} className={`text-[10px] py-0 ${isLayaway ? 'bg-amber-100 text-amber-800' : ''}`}>
                                  {o?.payment_method || 'COD'}
                                </Badge>
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-900">
                                {ao.quantity || 1}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
