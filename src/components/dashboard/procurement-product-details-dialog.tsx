'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useSupabase, useUser } from "@/lib/supabase/hooks";
import { useState, useEffect } from "react";
import Image from "next/image";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageOpen, TrendingDown, Image as ImageIcon } from "lucide-react";

interface ProcurementProductDetailsDialogProps {
  product: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProcurementProductDetailsDialog({ product, open, onOpenChange }: ProcurementProductDetailsDialogProps) {
  const supabase = useSupabase();
  const { user } = useUser();
  const [dateRange, setDateRange] = useState<string>("7days"); // 7days, 30days, all

  const [totalSold, setTotalSold] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      if (!open || !product || !supabase || !user) return;
      
      setIsLoadingStats(true);
      try {
        let fromDate = new Date();
        if (dateRange === "7days") {
          fromDate.setDate(fromDate.getDate() - 7);
        } else if (dateRange === "30days") {
          fromDate.setDate(fromDate.getDate() - 30);
        } else {
          fromDate = new Date(0); // All time
        }

        // Fetch completed, shipped, processing orders
        const { data: orderItems, error } = await supabase
            .from('order_items')
            .select(`
                quantity,
                orders!inner (
                    status,
                    created_at
                )
            `)
            .eq('product_id', product.id)
            .gte('orders.created_at', fromDate.toISOString())
            .in('orders.status', ['Completed', 'Shipped', 'Processing']);

        if (error) throw error;

        const sold = orderItems?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
        setTotalSold(sold);
      } catch (e) {
        console.error("Error fetching stats:", e);
        setTotalSold(0);
      } finally {
        setIsLoadingStats(false);
      }
    }

    fetchStats();
  }, [open, product, dateRange, supabase, user]);

  if (!product) return null;

  const displayImage = product.images && product.images.length > 0 ? product.images[0] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Procurement Details</DialogTitle>
          <DialogDescription>
            Review product details and sales velocity to determine reorder quantities.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
            <div className="flex gap-4 items-start">
                <div className="h-32 w-32 shrink-0 bg-muted rounded-md overflow-hidden flex items-center justify-center border">
                    {displayImage ? (
                        <Image 
                            src={displayImage} 
                            alt={product.name} 
                            width={128} 
                            height={128} 
                            className="object-cover w-full h-full"
                        />
                    ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground opacity-50" />
                    )}
                </div>
                <div className="space-y-2 flex-1">
                    <h3 className="font-semibold text-lg leading-tight">{product.name}</h3>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">{product.sku}</Badge>
                        {product.category && <Badge variant="secondary">{product.category}</Badge>}
                    </div>
                    {product.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                            {product.description}
                        </p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <Card className="border-destructive/50 bg-destructive/5">
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
                            <TrendingDown className="h-4 w-4" /> Current Stock
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="text-3xl font-bold text-destructive">
                            {product.quantityOnHand}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Pending fulfillment shortage
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <PackageOpen className="h-4 w-4" /> Units Processed
                        </CardTitle>
                        <Select value={dateRange} onValueChange={setDateRange}>
                            <SelectTrigger className="w-[120px] h-7 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7days">Past 7 Days</SelectItem>
                                <SelectItem value="30days">Past 30 Days</SelectItem>
                                <SelectItem value="all">All Time</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="text-3xl font-bold">
                            {isLoadingStats ? (
                                <Skeleton className="h-9 w-16" />
                            ) : (
                                totalSold
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Orders (Completed, Shipped, Processing)
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
