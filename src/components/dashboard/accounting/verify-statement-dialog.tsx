'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, isValid } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle2, Eye, FileSearch, FileUp, Loader2 } from 'lucide-react';
import type {
  PaymentStatus,
  StatementDateAmountCandidate,
  VerifyPdfResponse,
} from '@/types/payment-log.types';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [resolvedMismatchRefs, setResolvedMismatchRefs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!result) {
      setSelectedCandidateIds(new Set());
      setConfirmedIds(new Set());
      setResolvedMismatchRefs(new Set());
      return;
    }
    const autoChecked = new Set(
      result.suggestedMatches
        .filter((c) => c.confidence === 'high' && !c.isAmbiguous)
        .map((c) => c.paymentId),
    );
    setSelectedCandidateIds(autoChecked);
    setConfirmedIds(new Set());
    setResolvedMismatchRefs(new Set());
  }, [result]);

  const visibleCandidates = useMemo(
    () => (result?.suggestedMatches || []).filter((c) => !confirmedIds.has(c.paymentId)),
    [result, confirmedIds],
  );

  const visibleMismatches = useMemo(
    () => (result?.amountMismatches || []).filter((m) => !resolvedMismatchRefs.has(m.refNo)),
    [result, resolvedMismatchRefs],
  );

  const toggleCandidate = (id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmSelected = async () => {
    const chosen = visibleCandidates.filter((c) => selectedCandidateIds.has(c.paymentId));
    if (chosen.length === 0) return;
    const ok = await onConfirmMatches(chosen);
    if (ok) {
      setConfirmedIds((prev) => {
        const next = new Set(prev);
        for (const c of chosen) next.add(c.paymentId);
        return next;
      });
      setSelectedCandidateIds(new Set());
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <FileSearch className="mr-2 h-4 w-4" />
          Verify via Statement
        </Button>
      </DialogTrigger>
      <DialogContent className={result ? 'max-w-4xl' : 'max-w-md'}>
        <DialogHeader>
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
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold">
                    Auto-verified {result.verifiedCount} payment{result.verifiedCount === 1 ? '' : 's'} by Reference No.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Scanned {result.statementRowCount} statement rows
                    {result.statementDateRange.min && result.statementDateRange.max
                      ? ` (${result.statementDateRange.min} to ${result.statementDateRange.max})`
                      : ''}
                    .
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onResetResult}>
                Upload Another PDF
              </Button>
            </div>

            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-5">
                {visibleCandidates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold">
                          Possible Bank / Remittance Matches ({visibleCandidates.length})
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Matched by exact amount (±₱1) and date (±2 days) for bank transfers, international remittances, or missing refs. Review and confirm.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isMutating || selectedCandidateIds.size === 0}
                        onClick={handleConfirmSelected}
                      >
                        Verify Selected ({selectedCandidateIds.size})
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {visibleCandidates.map((c) => {
                        const checked = selectedCandidateIds.has(c.paymentId);
                        const payD = new Date(c.paymentDate);
                        return (
                          <div
                            key={`${c.paymentId}-${c.statementDate}-${c.statementRef || c.statementDesc}`}
                            className="flex items-start gap-3 rounded-md border p-2.5 text-xs"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleCandidate(c.paymentId)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {c.orderId && (
                                  <Link
                                    href={`/dashboard/orders/${c.orderId}`}
                                    className="font-semibold text-primary hover:underline"
                                  >
                                    #{c.orderShortId}
                                  </Link>
                                )}
                                <span className="font-medium">{c.customerName}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {c.paymentMethod}
                                </Badge>
                                <span className="font-semibold">{peso(c.amount)}</span>
                                <span className="text-muted-foreground">
                                  ({isValid(payD) ? format(payD, 'MMM d, yyyy') : c.paymentDate})
                                </span>
                                {c.channelLabel && (
                                  <Badge className="text-[10px] bg-blue-600 hover:bg-blue-600">
                                    {c.channelLabel}
                                  </Badge>
                                )}
                                <Badge
                                  variant={c.confidence === 'high' && !c.isAmbiguous ? 'default' : 'secondary'}
                                  className="text-[10px]"
                                >
                                  {c.isAmbiguous ? 'Ambiguous' : c.confidence === 'high' ? 'High match' : 'Check date'}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground break-words">
                                Statement: <strong>{c.statementDate}</strong> • <strong>{peso(c.statementAmount)}</strong>
                                {c.statementRef ? ` • Ref ${c.statementRef}` : ''} • {c.statementDesc}
                              </p>
                            </div>
                            {c.proofUrl && (
                              <a
                                href={c.proofUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted shrink-0"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Proof
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {visibleMismatches.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <h4 className="text-sm font-semibold">
                        Ref Found on Statement, Amount Differs ({visibleMismatches.length})
                      </h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      These reference numbers appeared on the statement, but the recorded amount differs by more than ₱5 (e.g. penalty, shipping fee, or split payment).
                    </p>
                    <div className="space-y-2">
                      {visibleMismatches.map((m) => (
                        <div key={m.refNo} className="rounded-md border border-amber-200 bg-amber-50/40 p-2.5 text-xs space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-mono font-semibold">Ref {m.refNo}</span>
                              {m.statementDate && <span className="text-muted-foreground"> ({m.statementDate})</span>}
                              <span className="ml-2">
                                Statement: <strong>{peso(m.statementAmount)}</strong> vs Recorded:{' '}
                                <strong className="text-destructive">{peso(m.recordedSum)}</strong>
                              </span>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={isMutating}
                              onClick={async () => {
                                if (!window.confirm(`Mark ${m.payments.length} payment(s) for Ref ${m.refNo} as Verified anyway?`)) return;
                                await onVerifyMismatchPayments(
                                  m.payments.map((p) => p.id),
                                  'Verified',
                                );
                                setResolvedMismatchRefs((prev) => new Set(prev).add(m.refNo));
                              }}
                            >
                              Mark Verified
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {m.payments.map((p) => (
                              <span key={p.id} className="inline-flex items-center gap-1 rounded bg-background px-2 py-0.5 border">
                                {p.orderId ? (
                                  <Link href={`/dashboard/orders/${p.orderId}`} className="font-semibold text-primary hover:underline">
                                    #{p.orderShortId}
                                  </Link>
                                ) : `#${p.orderShortId}`}
                                <span>{p.customerName}</span>
                                <strong>{peso(p.amount)}</strong>
                                {p.proofUrl && (
                                  <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-primary underline ml-1">
                                    proof
                                  </a>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {visibleCandidates.length === 0 && visibleMismatches.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No remaining date/amount bank candidates or reference mismatches to review from this PDF.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
