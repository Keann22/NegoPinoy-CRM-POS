'use client';

import { useState } from 'react';
import { format, isValid } from 'date-fns';
import Link from 'next/link';
import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Check, Eye, Loader2, MoreHorizontal, Pencil, ScanText, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { isOwnPhoneNumberRef } from '@/lib/services/payments/payment-ref-utils';
import type { PaymentLogItem, PaymentStatus } from '@/types/payment-log.types';

function getStatusVariant(status: PaymentStatus) {
  switch (status) {
    case 'Verified':
      return 'default' as const;
    case 'Rejected':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export function PaymentTableRow({
  payment,
  isSelected,
  onToggleSelect,
  handleStatusChange,
  onSaveReference,
  onRerunOcr,
  isRerunningOcr,
}: {
  payment: PaymentLogItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  handleStatusChange: (paymentId: string, newStatus: PaymentStatus) => void;
  onSaveReference: (paymentId: string, refNo: string | null) => Promise<boolean>;
  onRerunOcr: (payment: PaymentLogItem) => void;
  isRerunningOcr: boolean;
}) {
  const [editingRef, setEditingRef] = useState(false);
  const [refDraft, setRefDraft] = useState(payment.reference_number || '');

  const d = new Date(payment.payment_date);
  const isDateValid = isValid(d);
  const shortOrder = (payment.order_id || '').substring(0, 7).toUpperCase();
  const hasPhoneRefBug = isOwnPhoneNumberRef(payment.reference_number);
  const ocrMismatch =
    payment.ocr_amount !== null && Math.abs(payment.ocr_amount - payment.amount) > 0.01;

  const notes = payment.notes || '';
  const hasReusedRef = notes.includes('[GCash reference already used');
  const hasWrongReceiver = notes.includes('[Not sent to our GCash:');
  const hasNoReceiver = notes.includes('[Not sent to our GCash?');

  const saveRef = async () => {
    const ok = await onSaveReference(payment.id, refDraft.trim() || null);
    if (ok) setEditingRef(false);
  };

  return (
    <TableRow className={isSelected ? 'bg-muted/40' : undefined}>
      <TableCell className="w-9">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(payment.id)}
          aria-label={`Select payment ${shortOrder}`}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {isDateValid ? format(d, 'MMM d, yyyy h:mm a') : 'Unknown'}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          {payment.order_id ? (
            <Link
              href={`/dashboard/orders/${payment.order_id}`}
              className="font-semibold text-primary hover:underline"
            >
              #{shortOrder}
            </Link>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
          {payment.order_status === 'Cancelled' && (
            <Badge variant="destructive" className="w-fit text-[10px] px-1.5 py-0">
              Cancelled
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="font-medium">
        {payment.customer_id ? (
          <Link
            href={`/dashboard/customers/${payment.customer_id}`}
            className="text-primary hover:underline"
          >
            {payment.customer_name}
          </Link>
        ) : (
          payment.customer_name
        )}
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
        {payment.sales_person_name}
      </TableCell>
      <TableCell className="text-xs">{payment.payment_method}</TableCell>
      <TableCell>
        {editingRef ? (
          <div className="flex items-center gap-1">
            <Input
              value={refDraft}
              onChange={(e) => setRefDraft(e.target.value)}
              className="h-7 w-36 text-xs font-mono"
              placeholder="Ref No."
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveRef();
                if (e.key === 'Escape') {
                  setRefDraft(payment.reference_number || '');
                  setEditingRef(false);
                }
              }}
            />
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={saveRef}>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setRefDraft(payment.reference_number || '');
                setEditingRef(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className={`font-mono text-xs ${hasPhoneRefBug ? 'text-destructive line-through' : ''}`}>
              {payment.reference_number || '-'}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Edit Reference No."
              onClick={() => {
                setRefDraft(payment.reference_number || '');
                setEditingRef(true);
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            {(!payment.reference_number || hasPhoneRefBug) && payment.proof_url && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                title="Re-run OCR on proof"
                disabled={isRerunningOcr}
                onClick={() => onRerunOcr(payment)}
              >
                {isRerunningOcr ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ScanText className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        {payment.proof_url ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                <Eye className="h-3.5 w-3.5 mr-1" />
                View
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Payment Proof — #{shortOrder}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={payment.proof_url}
                  alt="Payment Proof"
                  className="max-h-[70vh] object-contain rounded-md"
                />
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          '-'
        )}
      </TableCell>
      <TableCell className="max-w-[220px]">
        <div className="space-y-1">
          <div className="truncate text-xs" title={notes || undefined}>
            {notes || '-'}
          </div>
          {(hasReusedRef || hasWrongReceiver || hasNoReceiver) && (
            <div className="flex flex-wrap gap-1">
              {hasReusedRef && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  Reused Ref
                </Badge>
              )}
              {hasWrongReceiver && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  Wrong GCash
                </Badge>
              )}
              {hasNoReceiver && !hasWrongReceiver && (
                <Badge variant="outline" className="border-amber-400 text-amber-700 text-[10px] px-1.5 py-0">
                  No Receiver
                </Badge>
              )}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right font-semibold whitespace-nowrap">
        ₱{payment.amount.toFixed(2)}
      </TableCell>
      <TableCell className={`text-right font-semibold whitespace-nowrap ${ocrMismatch ? 'text-destructive' : ''}`}>
        {payment.ocr_amount !== null ? `₱${payment.ocr_amount.toFixed(2)}` : '-'}
      </TableCell>
      <TableCell>
        <Badge variant={getStatusVariant(payment.status)}>{payment.status}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={payment.status}
              onValueChange={(val) => handleStatusChange(payment.id, val as PaymentStatus)}
            >
              <DropdownMenuRadioItem value="Pending">Pending</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="Verified">Verified</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="Rejected">Rejected</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
