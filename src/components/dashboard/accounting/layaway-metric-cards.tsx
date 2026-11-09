'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, Wallet, Package, CheckCircle2 } from 'lucide-react';

interface LayawayStats {
  totalCount: number;
  totalValue: number;
  totalPaid: number;
  totalBalance: number;
  aging90Count: number;
  dormantCount: number;
  dormantPaid: number;
}

interface LayawayMetricCardsProps {
  stats: LayawayStats;
  isManagement: boolean;
}

export function LayawayMetricCards({ stats, isManagement }: LayawayMetricCardsProps) {
  const formatMoney = (val: number) =>
    '₱' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (isManagement) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60">
          <CardHeader className="p-3 sm:p-4 pb-1">
            <CardDescription className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Dormant (&ge;90d No Pay)
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
    );
  }

  // Sales Staff View: operational counts only, no store-wide financial totals
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60">
        <CardHeader className="p-3 sm:p-4 pb-1">
          <CardDescription className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Dormant (&ge;90d No Pay)
          </CardDescription>
          <CardTitle className="text-xl sm:text-2xl font-bold text-amber-900 dark:text-amber-300">
            {stats.dormantCount} orders
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-1 text-xs text-muted-foreground">
          Pending customer follow-up
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
            <CheckCircle2 className="h-3.5 w-3.5" />
            Active Paying
          </CardDescription>
          <CardTitle className="text-xl sm:text-2xl font-bold text-emerald-600">
            {stats.aging90Count - stats.dormantCount} orders
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-1 text-xs text-muted-foreground">
          Recent installment received
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 sm:p-4 pb-1">
          <CardDescription className="text-xs font-semibold flex items-center gap-1">
            <Package className="h-3.5 w-3.5" />
            All Open Lay-aways
          </CardDescription>
          <CardTitle className="text-xl sm:text-2xl font-bold">
            {stats.totalCount} orders
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-1 text-xs text-muted-foreground">
          Active open accounts
        </CardContent>
      </Card>
    </div>
  );
}
