'use client';

import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { TodaysPurchasesPanel } from '@/components/dashboard/procurement/todays-purchases-panel';

// Admin-only: the day's purchases by supplier, and the bought-vs-received
// check where receipts get scanned. Suppliers and costs never reach staff.
export default function PurchasesReceiptsPage() {
  const { isManagement, isLoading } = useRoleCheck();

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!isManagement) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unauthorized</CardTitle>
          <CardDescription>You do not have permission to view this page.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="max-w-5xl mx-auto">
      <CardContent className="space-y-4 pt-6 [&>*]:min-w-0">
        <TodaysPurchasesPanel
          active
          initialTab="received"
          onChanged={() => {}}
          renderTitle={(title, description) => (
            <div>
              <h1 className="text-2xl font-bold font-headline">Purchases &amp; Receipts</h1>
              <p className="text-sm text-muted-foreground">
                {title}. {description} Scan each supplier&apos;s receipt on the Received tab.
              </p>
            </div>
          )}
        />
      </CardContent>
    </Card>
  );
}
