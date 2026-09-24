'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface AlertReviewKpiCardsProps {
  pendingCount: number;
  resolvedCount: number;
  negativeStockCount: number;
  totalAlertsCount: number;
}

export function AlertReviewKpiCards({
  pendingCount,
  resolvedCount,
  negativeStockCount,
  totalAlertsCount
}: AlertReviewKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="shadow-sm border-amber-200 bg-amber-50/20">
        <CardHeader className="p-4 pb-1">
          <CardDescription className="text-xs font-medium text-amber-700">Pending Review</CardDescription>
          <CardTitle className="text-2xl font-extrabold text-amber-800">{pendingCount}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 text-[11px] text-amber-600">
          Items needing audit / confirmation
        </CardContent>
      </Card>

      <Card className="shadow-sm border-emerald-200 bg-emerald-50/20">
        <CardHeader className="p-4 pb-1">
          <CardDescription className="text-xs font-medium text-emerald-700">Confirmed Stocks</CardDescription>
          <CardTitle className="text-2xl font-extrabold text-emerald-800">{resolvedCount}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 text-[11px] text-emerald-600">
          Reviewed and verified by staff/admin
        </CardContent>
      </Card>

      <Card className="shadow-sm border-rose-200 bg-rose-50/30">
        <CardHeader className="p-4 pb-1">
          <CardDescription className="text-xs font-medium text-rose-700">Negative Stock Items</CardDescription>
          <CardTitle className="text-2xl font-extrabold text-rose-700">{negativeStockCount}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 text-[11px] text-rose-600">
          Items currently below 0 in ledger
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-1">
          <CardDescription className="text-xs font-medium">Telegram Alerts Sent</CardDescription>
          <CardTitle className="text-2xl font-extrabold text-indigo-600">{totalAlertsCount}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 text-[11px] text-muted-foreground">
          Total notification messages logged
        </CardContent>
      </Card>
    </div>
  );
}
