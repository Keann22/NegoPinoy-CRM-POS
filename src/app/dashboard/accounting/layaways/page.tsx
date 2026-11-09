'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useLayawayReview } from '@/hooks/useLayawayReview';
import { LayawayOrderCard } from '@/components/dashboard/accounting/layaway-order-card';
import { LayawayHistoryDialog } from '@/components/dashboard/accounting/layaway-history-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  Search,
  RefreshCw,
  AlertTriangle,
  Wallet,
  CheckCircle2,
  Package,
  ArrowLeft
} from 'lucide-react';

export default function LayawaysReviewPage() {
  const { userProfile, isLoading: profileLoading } = useUserProfile();

  const isManagement = useMemo(
    () => userProfile?.roles.some((r) => ['Admin', 'Owner'].includes(r)),
    [userProfile]
  );

  const {
    orders,
    isLoading,
    isUpdating,
    refreshLayaways,
    updateOrderNotes,
    updateOrderStatus,
    fetchCustomerHistory,
    historyOrders,
    isHistoryLoading,
    historyCustomerName,
  } = useLayawayReview();

  const [activeTab, setActiveTab] = useState<'dormant' | 'aging' | 'active' | 'all'>('dormant');
  const [searchQuery, setSearchQuery] = useState('');
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Open customer history dialog
  const handleViewCustomerHistory = (customerId?: string, customerName?: string) => {
    fetchCustomerHistory(customerId, customerName);
    setIsHistoryDialogOpen(true);
  };

  // Compute stats across all processing lay-aways
  const stats = useMemo(() => {
    const totalCount = orders.length;
    const totalValue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalPaid = orders.reduce((sum, o) => sum + o.amountPaid, 0);
    const totalBalance = orders.reduce((sum, o) => sum + o.balanceDue, 0);

    const aging90 = orders.filter((o) => o.orderAgeDays >= 90);
    const dormant = aging90.filter((o) => o.activityStatus === 'dormant');
    const dormantPaid = dormant.reduce((sum, o) => sum + o.amountPaid, 0);

    return {
      totalCount,
      totalValue,
      totalPaid,
      totalBalance,
      aging90Count: aging90.length,
      dormantCount: dormant.length,
      dormantPaid,
    };
  }, [orders]);

  // Filter orders by active tab and search query
  const filteredOrders = useMemo(() => {
    let list = orders;

    if (activeTab === 'dormant') {
      // Created >=90 days ago AND dormant
      list = list.filter((o) => o.orderAgeDays >= 90 && o.activityStatus === 'dormant');
    } else if (activeTab === 'aging') {
      // Created >=90 days ago
      list = list.filter((o) => o.orderAgeDays >= 90);
    } else if (activeTab === 'active') {
      // Created >=90 days ago AND active paying
      list = list.filter((o) => o.orderAgeDays >= 90 && o.activityStatus === 'active_paying');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((o) => {
        const matchName = o.customerName.toLowerCase().includes(q);
        const matchPhone = o.customerPhone.toLowerCase().includes(q);
        const matchId = o.id.toLowerCase().includes(q);
        const matchAgent = o.salesPersonName.toLowerCase().includes(q);
        const matchItems = o.items.some((it) => it.name.toLowerCase().includes(q));
        const matchNotes = o.notes.toLowerCase().includes(q);
        return matchName || matchPhone || matchId || matchAgent || matchItems || matchNotes;
      });
    }

    return list;
  }, [orders, activeTab, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, currentPage]);

  const formatMoney = (val: number) =>
    '₱' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (profileLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!isManagement) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-bold text-destructive">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Only Admins and Owners can access the Lay-away Review page.
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link href="/dashboard/accounting/payments">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Lay-away Audit & Stale Order Review
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-10">
            Review aging and uncompleted lay-aways, cross-check customer shipment history, and adjust order notes & status.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshLayaways()}
          disabled={isLoading}
          className="flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60">
          <CardHeader className="p-3 sm:p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Dormant (&gt;45d No Pay)
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold text-amber-900 dark:text-amber-300">
              {stats.dormantCount} orders
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-1 text-xs text-muted-foreground">
            Deposits held: <strong className="text-foreground">{formatMoney(stats.dormantPaid)}</strong>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60">
          <CardHeader className="p-3 sm:p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" />
              Cash Collected in Advance
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {formatMoney(stats.totalPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-1 text-xs text-muted-foreground">
            Across {stats.totalCount} open lay-away orders
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 sm:p-4 pb-1">
            <CardDescription className="text-xs font-semibold flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Aging &gt;90 Days
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold">
              {stats.aging90Count} orders
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-1 text-xs text-muted-foreground">
            Created between May and August
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 sm:p-4 pb-1">
            <CardDescription className="text-xs font-semibold flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              Unpaid Balance
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold text-rose-600">
              {formatMoney(stats.totalBalance)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-1 text-xs text-muted-foreground">
            Total pending customer balance
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as 'dormant' | 'aging' | 'active' | 'all');
            setCurrentPage(1);
          }}
          className="w-full md:w-auto"
        >
          <TabsList className="grid grid-cols-4 w-full md:w-auto text-xs">
            <TabsTrigger value="dormant" className="text-xs px-2.5 sm:px-4">
              Dormant ({stats.dormantCount})
            </TabsTrigger>
            <TabsTrigger value="aging" className="text-xs px-2.5 sm:px-4">
              Aging &gt;90d ({stats.aging90Count})
            </TabsTrigger>
            <TabsTrigger value="active" className="text-xs px-2.5 sm:px-4">
              Active ({stats.aging90Count - stats.dormantCount})
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs px-2.5 sm:px-4">
              All Open ({stats.totalCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customer, phone, order, agent..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-8 text-xs h-9 bg-background"
          />
        </div>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="space-y-4 py-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : paginatedOrders.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent className="space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <h3 className="font-semibold text-lg text-foreground">No Lay-away Orders Found</h3>
            <p className="text-xs text-muted-foreground">
              {searchQuery ? 'No orders match your search criteria.' : 'There are no orders in this category.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground flex items-center justify-between px-1">
            <span>
              Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> –{' '}
              <strong>{Math.min(currentPage * itemsPerPage, filteredOrders.length)}</strong> of{' '}
              <strong>{filteredOrders.length}</strong> orders
            </span>
            <span>Right side has direct note editing & quick actions</span>
          </div>

          {paginatedOrders.map((order) => (
            <LayawayOrderCard
              key={order.id}
              order={order}
              isUpdating={isUpdating === order.id}
              onSaveNotes={updateOrderNotes}
              onUpdateStatus={updateOrderStatus}
              onViewHistory={handleViewCustomerHistory}
            />
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="text-xs h-8"
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="text-xs h-8"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Customer History Dialog */}
      <LayawayHistoryDialog
        open={isHistoryDialogOpen}
        onOpenChange={setIsHistoryDialogOpen}
        customerName={historyCustomerName}
        orders={historyOrders}
        isLoading={isHistoryLoading}
      />
    </div>
  );
}
