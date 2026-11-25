'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileSearch, FileUp, Loader2 } from 'lucide-react';
import { VerifyStatementResults } from './verify-statement-results';
import type {
  PaymentStatus,
  StatementDateAmountCandidate,
  VerifyPdfResponse,
} from '@/types/payment-log.types';

export function VerifyStatementDialog({
  isOpen,
  onOpenChange,
  verifyFile,
  setVerifyFile,
  verifyPassword,
  setVerifyPassword,
  isVerifying,
  onSubmit,
  result,
  onResetResult,
  onConfirmMatches,
  onVerifyMismatchPayments,
  isMutating,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  verifyFile: File | null;
  setVerifyFile: (file: File | null) => void;
  verifyPassword: string;
  setVerifyPassword: (pass: string) => void;
  isVerifying: boolean;
  onSubmit: (e: React.FormEvent) => void;
  result: VerifyPdfResponse | null;
  onResetResult: () => void;
  onConfirmMatches: (candidates: StatementDateAmountCandidate[]) => Promise<boolean>;
  onVerifyMismatchPayments: (paymentIds: string[], status: PaymentStatus) => Promise<void>;
  isMutating: boolean;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <FileSearch className="mr-2 h-4 w-4" />
          Verify via Statement
        </Button>
      </DialogTrigger>
      <DialogContent className={result ? 'max-w-4xl max-h-[90vh] flex flex-col overflow-hidden' : 'max-w-md'}>
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {result ? 'GCash Statement Results' : 'Upload GCash / Bank Statement'}
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <form onSubmit={onSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Statement PDF</label>
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => setVerifyFile(e.target.files?.[0] || null)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Document Password (Optional)</label>
              <Input
                type="password"
                placeholder="Enter PDF password if protected"
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isVerifying || !verifyFile}>
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scanning PDF...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Upload & Verify
                </>
              )}
            </Button>
          </form>
        ) : (
          <VerifyStatementResults
            result={result}
            onResetResult={onResetResult}
            onConfirmMatches={onConfirmMatches}
            onVerifyMismatchPayments={onVerifyMismatchPayments}
            isMutating={isMutating}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
