'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PaymentTableRow } from './payment-table-row';
import type { PaymentLogItem, PaymentStatus } from '@/types/payment-log.types';

export function PaymentHistoryTable({
  isLoading,
  paginatedData,
  selectedIds,
  onToggleSelect,
  onToggleSelectPage,
  handleStatusChange,
  onSaveReference,
  onRerunOcr,
  rerunningOcrId,
}: {
  isLoading: boolean;
  paginatedData: PaymentLogItem[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectPage: (checked: boolean) => void;
  handleStatusChange: (paymentId: string, newStatus: PaymentStatus) => void;
  onSaveReference: (paymentId: string, refNo: string | null) => Promise<boolean>;
  onRerunOcr: (payment: PaymentLogItem) => void;
  rerunningOcrId: string | null;
}) {
  const allOnPageSelected =
    paginatedData.length > 0 && paginatedData.every((p) => selectedIds.has(p.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-9">
            <Checkbox
              checked={allOnPageSelected}
              onCheckedChange={(checked) => onToggleSelectPage(Boolean(checked))}
              aria-label="Select all on page"
            />
          </TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Order</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Processor</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Ref No.</TableHead>
          <TableHead>Proof</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">OCR Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-7 w-16" /></TableCell>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
              <TableCell><Skeleton className="h-6 w-20" /></TableCell>
              <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
            </TableRow>
          ))}
        {!isLoading &&
          paginatedData.map((payment) => (
            <PaymentTableRow
              key={payment.id}
              payment={payment}
              isSelected={selectedIds.has(payment.id)}
              onToggleSelect={onToggleSelect}
              handleStatusChange={handleStatusChange}
              onSaveReference={onSaveReference}
              onRerunOcr={onRerunOcr}
              isRerunningOcr={rerunningOcrId === payment.id}
            />
          ))}
      </TableBody>
    </Table>
  );
}
