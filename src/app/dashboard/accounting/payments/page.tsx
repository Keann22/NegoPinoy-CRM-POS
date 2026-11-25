'use client';

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VerifyStatementDialog } from '@/components/dashboard/accounting/verify-statement-dialog';
import { PaymentHistoryTable } from '@/components/dashboard/accounting/payment-history-table';
import { PaymentLogToolbar } from '@/components/dashboard/accounting/payment-log-toolbar';
import { usePaymentsLog } from '@/hooks/usePaymentsLog';
import type { PaymentStatus, VerifyPdfResponse } from '@/types/payment-log.types';

export default function PaymentsPage() {
  const { userProfile } = useUserProfile();
  const { toast } = useToast();

  const isManagement = useMemo(
    () => Boolean(userProfile?.roles.some((r) => ['Admin', 'Owner'].includes(r))),
    [userProfile],
  );

  const log = usePaymentsLog(isManagement);

  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyPdfResponse | null>(null);

  const handleVerifyDialogOpenChange = (open: boolean) => {
    setIsVerifyDialogOpen(open);
    if (!open) {
      setVerifyResult(null);
      setVerifyFile(null);
      setVerifyPassword('');
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyFile) return;

    setIsVerifying(true);
    try {
      const formData = new FormData();
      formData.append('file', verifyFile);
      if (verifyPassword) formData.append('password', verifyPassword);

      const res = await fetch('/api/payments/verify-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify');
      }

      const parsed = data as VerifyPdfResponse;
      setVerifyResult(parsed);
      toast({
        title: 'Statement Scanned',
        description: `Auto-verified ${parsed.verifiedCount} payment(s). Found ${parsed.suggestedMatches.length} possible bank/remittance match(es) and ${parsed.amountMismatches.length} amount mismatch(es).`,
      });
      await log.refresh();
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBulkStatus = async (status: PaymentStatus) => {
    const count = log.selectedIds.size;
    if (count === 0) return;
    if (count > 1 && !window.confirm(`Mark ${count} selected payment(s) as ${status}?`)) {
      return;
    }
    await log.bulkUpdateStatus(Array.from(log.selectedIds), status);
  };

  if (userProfile && !isManagement) {
    return (
      <Card className="m-6 border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Access Denied</CardTitle>
          <CardDescription>
            You do not have permission to view financial records or payments.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const startIndex = log.filteredPayments.length === 0 ? 0 : (log.currentPage - 1) * log.pageSize + 1;
  const endIndex = Math.min(log.currentPage * log.pageSize, log.filteredPayments.length);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Payments Log</CardTitle>
          <CardDescription>
            View all logged payments, filter by issue or method, verify against GCash statements (including bank &amp; remittance matches), and update statuses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <Tabs value={log.activeTab} onValueChange={(v) => log.setActiveTab(v as PaymentStatus)}>
              <TabsList>
                <TabsTrigger value="Pending">Pending ({log.counts.Pending})</TabsTrigger>
                <TabsTrigger value="Verified">Verified ({log.counts.Verified})</TabsTrigger>
                <TabsTrigger value="Rejected">Rejected ({log.counts.Rejected})</TabsTrigger>
              </TabsList>
            </Tabs>

            <VerifyStatementDialog
              isOpen={isVerifyDialogOpen}
              onOpenChange={handleVerifyDialogOpenChange}
              verifyFile={verifyFile}
              setVerifyFile={setVerifyFile}
              verifyPassword={verifyPassword}
              setVerifyPassword={setVerifyPassword}
              isVerifying={isVerifying}
              onSubmit={handleVerifySubmit}
              result={verifyResult}
              onResetResult={() => setVerifyResult(null)}
              onConfirmMatches={log.confirmStatementMatches}
              onVerifyMismatchPayments={(ids, status) => log.bulkUpdateStatus(ids, status)}
              isMutating={log.isMutating}
            />
          </div>

          <PaymentLogToolbar
            activeTab={log.activeTab}
            bucket={log.bucket}
            onBucketChange={log.setBucket}
            bucketCounts={log.bucketCounts}
            search={log.search}
            onSearchChange={log.setSearch}
            dateFrom={log.dateFrom}
            onDateFromChange={log.setDateFrom}
            dateTo={log.dateTo}
            onDateToChange={log.setDateTo}
            filteredCount={log.filteredPayments.length}
            selectedCount={log.selectedIds.size}
            isMutating={log.isMutating}
            onSelectAllFiltered={log.selectAllFiltered}
            onClearSelection={log.clearSelection}
            onBulkStatus={handleBulkStatus}
          />

          <PaymentHistoryTable
            isLoading={log.isLoading}
            paginatedData={log.paginatedData}
            selectedIds={log.selectedIds}
            onToggleSelect={log.toggleSelect}
            onToggleSelectPage={log.toggleSelectPage}
            handleStatusChange={log.updateStatus}
            onSaveReference={log.updateReference}
            onRerunOcr={log.rerunOcr}
            rerunningOcrId={log.rerunningOcrId}
          />

          {!log.isLoading && log.filteredPayments.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
              <p className="text-lg font-semibold">No payments found</p>
              <p className="text-muted-foreground mt-2">
                Try clearing your filters or switch tabs.
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing <strong>{startIndex}-{endIndex}</strong> of{' '}
            <strong>{log.filteredPayments.length}</strong> payments
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => log.setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={log.currentPage === 1 || log.isLoading}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {log.currentPage} of {log.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => log.setCurrentPage((p) => Math.min(log.totalPages, p + 1))}
              disabled={
                log.currentPage === log.totalPages ||
                log.isLoading ||
                log.filteredPayments.length === 0
              }
            >
              Next
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
