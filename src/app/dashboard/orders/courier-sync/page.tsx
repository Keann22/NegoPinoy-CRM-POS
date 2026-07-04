'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Truck, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCourierSync } from '@/hooks/useCourierSync';
import { CourierSyncResultsTabs } from '@/components/dashboard/orders/courier-sync-results-tabs';

export default function CourierSyncPage() {
  const router = useRouter();
  const {
    loading,
    results,
    fileInputRef,
    canSyncCourier,
    handleFileUpload
  } = useCourierSync();

  if (!canSyncCourier) {
    return (
      <Card className="m-6 border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Access Denied</CardTitle>
          <CardDescription>You do not have permission to access Courier Sync.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => router.push('/dashboard/orders')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Orders
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="font-headline text-2xl flex items-center gap-2">
                <Truck className="h-6 w-6" />
                Courier Bulk Sync
              </CardTitle>
              <CardDescription>
                Upload an Excel file containing tracking numbers and statuses to bulk update your orders.
              </CardDescription>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx, .xls"
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Upload className="mr-2 h-4 w-4" />
                {loading ? 'Processing...' : 'Upload Sync File'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!results ? (
            <div className="grid gap-6 md:grid-cols-3 mt-4">
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">1. Prepare File</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Ensure your Excel file has headers for <strong>Order Number</strong>, <strong>Tracking Number</strong>, and <strong>Status</strong>.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">2. Upload File</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Click the green upload button and select your Excel sheet. The system will process it row by row.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">3. Review Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    A report will be generated showing which orders successfully updated and which ones had errors.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <CourierSyncResultsTabs results={results} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
