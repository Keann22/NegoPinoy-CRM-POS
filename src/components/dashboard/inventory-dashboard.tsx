"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSupabase, useUser } from "@/lib/supabase/hooks";
import { AlertTriangle, Package, ArrowDownToLine, ArrowUpRight, ClipboardList, Settings2, PackageSearch } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderIssues } from "@/components/dashboard/order-issues";
import { useRoleCheck } from "@/hooks/useRoleCheck";

export function InventoryDashboard() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { isManagement } = useRoleCheck();
  const [metrics, setMetrics] = useState({
    totalProducts: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user) return;

    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        // Fetch total products
        const { count: totalProducts } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true });

        // Fetch low stock items (e.g., < 5, excluding 0)
        const { count: lowStock } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .gt('stock_level', 0)
          .lt('stock_level', 5);

        // Fetch out of stock items
        const { count: outOfStock } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .lte('stock_level', 0);

        setMetrics({
          totalProducts: totalProducts || 0,
          lowStockCount: lowStock || 0,
          outOfStockCount: outOfStock || 0,
        });
      } catch (err) {
        console.error("Error fetching inventory metrics:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [supabase, user]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Inventory Dashboard</h1>
        <p className="text-muted-foreground">Overview of your warehouse stock and quick actions.</p>
      </div>

      <OrderIssues isAdmin={isManagement} />

      <div className="grid gap-4 md:grid-cols-3 mt-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
              <div className="text-3xl font-bold">{metrics.totalProducts}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Active product variants in database
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
              <div className="text-3xl font-bold text-amber-600">{metrics.lowStockCount}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Items with less than 5 in stock
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
              <div className="text-3xl font-bold text-red-600">{metrics.outOfStockCount}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Items completely depleted
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/dashboard/inventory/receive" className="block">
            <Card className="hover:bg-muted/50 transition-colors h-full">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
                <ArrowDownToLine className="h-8 w-8 mb-4 text-primary" />
                <h3 className="font-medium">Receive POS</h3>
                <p className="text-xs text-muted-foreground mt-1">Receive deliveries from suppliers</p>
              </CardContent>
            </Card>
          </Link>
          
          <Link href="/dashboard/inventory/restock" className="block">
            <Card className="hover:bg-muted/50 transition-colors h-full">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
                <ArrowUpRight className="h-8 w-8 mb-4 text-primary" />
                <h3 className="font-medium">Direct Restock</h3>
                <p className="text-xs text-muted-foreground mt-1">Manually add stock to shelves</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/inventory/procurement-request" className="block">
            <Card className="hover:bg-muted/50 transition-colors h-full">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
                <ClipboardList className="h-8 w-8 mb-4 text-primary" />
                <h3 className="font-medium">Procurement</h3>
                <p className="text-xs text-muted-foreground mt-1">Request new items to purchase</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/inventory/audit" className="block">
            <Card className="hover:bg-muted/50 transition-colors h-full">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
                <PackageSearch className="h-8 w-8 mb-4 text-primary" />
                <h3 className="font-medium">Stock Audit</h3>
                <p className="text-xs text-muted-foreground mt-1">Check and verify current stock levels</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
