'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useSPXRemittance } from '@/hooks/useSPXRemittance';
import { RemittanceResultsTabs } from '@/components/dashboard/accounting/remittance-results-tabs';

export default function SPXRemittancesPage() {
  const { userProfile } = useUserProfile();
  const { loading, results, fileInputRef, handleRemittanceUpload } = useSPXRemittance();

  const isManagement = useMemo(() => {
    return userProfile?.roles?.some(r => ['Admin', 'Owner'].includes(r));
  }, [userProfile]);

  if (!isManagement) {
    return (
      <Card className="m-6 border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Access Denied</CardTitle>
          <CardDescription>You do not have permission to access SPX remittances.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="font-headline text-2xl flex items-center gap-2">
                <FileText className="h-6 w-6" />
                SPX Remittances
              </CardTitle>
              <CardDescription>
                Upload your SPX financial transaction list to automatically sync COD payments, deduct courier fees, and update order statuses.
              </CardDescription>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleRemittanceUpload}
                accept=".xlsx, .xls"
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Upload className="mr-2 h-4 w-4" />
                {loading ? 'Processing...' : 'Upload Remittance File'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!results ? (
            <div className="grid gap-6 md:grid-cols-3 mt-4">
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">1. Export from SPX</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Go to your Shopee Xpress or courier portal and download the "Account Transaction List" Excel file that contains your COD collections and shipping fees.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">2. Upload File</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Click the green "Upload Remittance File" button above and select your downloaded Excel file.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">3. Auto Sync</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    The system will automatically match tracking numbers, update customer balances to zero, log the COD payments, and record courier fees as expenses.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <RemittanceResultsTabs 
              results={results} 
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
