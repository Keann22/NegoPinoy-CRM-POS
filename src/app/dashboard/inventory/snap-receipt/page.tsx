'use client';

import { Loader2 } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { SnapReceiptView } from '@/components/dashboard/procurement/snap-receipt-view';

// Owners only: receipt photos carry suppliers and prices.
export default function SnapReceiptPage() {
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
  return <SnapReceiptView />;
}
