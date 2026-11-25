'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCheck, Search, X, XCircle } from 'lucide-react';
import type { PaymentBucket, PaymentStatus } from '@/types/payment-log.types';

const BUCKET_OPTIONS: { key: PaymentBucket; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'gcash_ref', label: 'GCash w/ Ref' },
  { key: 'amount_mismatch', label: 'Amount ≠ OCR' },
  { key: 'missing_ref', label: 'Missing Ref' },
  { key: 'bank_other', label: 'Bank / Maya / Other' },
  { key: 'cash_cod', label: 'Cash / COD' },
  { key: 'cancelled', label: 'Cancelled Orders' },
];

export function PaymentLogToolbar({
  activeTab,
  bucket,
  onBucketChange,
  bucketCounts,
  search,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  filteredCount,
  selectedCount,
  isMutating,
  onSelectAllFiltered,
  onClearSelection,
  onBulkStatus,
}: {
  activeTab: PaymentStatus;
  bucket: PaymentBucket;
  onBucketChange: (bucket: PaymentBucket) => void;
  bucketCounts: Record<PaymentBucket, number>;
  search: string;
  onSearchChange: (val: string) => void;
  dateFrom: string;
  onDateFromChange: (val: string) => void;
  dateTo: string;
  onDateToChange: (val: string) => void;
  filteredCount: number;
  selectedCount: number;
  isMutating: boolean;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onBulkStatus: (status: PaymentStatus) => void;
}) {
  const hasFilters = Boolean(search.trim() || dateFrom || dateTo || (activeTab === 'Pending' && bucket !== 'all'));

  return (
    <div className="space-y-3 mb-4">
      {activeTab === 'Pending' && (
        <div className="flex flex-wrap gap-1.5">
          {BUCKET_OPTIONS.map((opt) => {
            const count = bucketCounts[opt.key] || 0;
            if (opt.key !== 'all' && count === 0) return null;
            const active = bucket === opt.key;
            const isAlert = opt.key === 'flagged' || opt.key === 'amount_mismatch';
            return (
              <Button
                key={opt.key}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className={`h-7 text-xs px-2.5 ${
                  !active && isAlert && count > 0 ? 'border-amber-400 text-amber-700 hover:bg-amber-50' : ''
                }`}
                onClick={() => onBucketChange(opt.key)}
              >
                {opt.label}
                <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] ${active ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                  {count}
                </span>
              </Button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search order #, customer, ref no., notes..."
            className="pl-8 h-9"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>From</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-9 w-[140px]"
          />
          <span>To</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-9 w-[140px]"
          />
        </div>

        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              onSearchChange('');
              onDateFromChange('');
              onDateToChange('');
              onBucketChange('all');
            }}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/60 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{selectedCount} selected</span>
            {selectedCount < filteredCount && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={onSelectAllFiltered}
              >
                Select all {filteredCount} matching
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTab !== 'Verified' && (
              <Button
                type="button"
                size="sm"
                className="h-8"
                disabled={isMutating}
                onClick={() => onBulkStatus('Verified')}
              >
                <CheckCheck className="h-4 w-4 mr-1.5" />
                Mark Verified
              </Button>
            )}
            {activeTab !== 'Rejected' && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={isMutating}
                onClick={() => onBulkStatus('Rejected')}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Mark Rejected
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={isMutating}
              onClick={onClearSelection}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
