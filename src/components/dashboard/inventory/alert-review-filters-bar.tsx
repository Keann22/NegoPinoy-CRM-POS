'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface AlertReviewFiltersBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  reviewStatus: 'pending' | 'resolved' | 'all';
  onReviewStatusChange: (s: 'pending' | 'resolved' | 'all') => void;
  rangeFilter: 'recent' | 'today' | 'all';
  onRangeFilterChange: (r: 'recent' | 'today' | 'all') => void;
  stockFilter: 'all' | 'negative' | 'zero' | 'positive';
  onStockFilterChange: (s: 'all' | 'negative' | 'zero' | 'positive') => void;
  pendingCount: number;
  resolvedCount: number;
  totalCount: number;
  negativeStockCount: number;
}

export function AlertReviewFiltersBar({
  searchQuery,
  onSearchChange,
  reviewStatus,
  onReviewStatusChange,
  rangeFilter,
  onRangeFilterChange,
  stockFilter,
  onStockFilterChange,
  pendingCount,
  resolvedCount,
  totalCount,
  negativeStockCount
}: AlertReviewFiltersBarProps) {
  return (
    <div className="p-4 border-b bg-slate-50 flex flex-col md:flex-row justify-between md:items-center gap-3">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search product name, SKU, shelf..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 h-9 text-xs bg-white"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Review Status Tabs */}
        <div className="inline-flex rounded-md border bg-white p-0.5 text-xs shadow-sm">
          <button
            type="button"
            onClick={() => onReviewStatusChange('pending')}
            className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1.5 ${
              reviewStatus === 'pending'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => onReviewStatusChange('resolved')}
            className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1.5 ${
              reviewStatus === 'resolved'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Confirmed ({resolvedCount})
          </button>
          <button
            type="button"
            onClick={() => onReviewStatusChange('all')}
            className={`px-3 py-1 rounded font-semibold transition-colors ${
              reviewStatus === 'all'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({totalCount})
          </button>
        </div>

        {/* Range Toggle */}
        <div className="inline-flex rounded-md border bg-white p-0.5 text-xs">
          {(['recent', 'today', 'all'] as const).map(r => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeFilterChange(r)}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                rangeFilter === r ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r === 'recent' ? 'Since Yesterday' : r === 'today' ? 'Today Only' : 'All Time'}
            </button>
          ))}
        </div>

        {/* Stock Filter */}
        <div className="inline-flex rounded-md border bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onStockFilterChange('all')}
            className={`px-2 py-1 rounded font-medium ${stockFilter === 'all' ? 'bg-slate-200 text-slate-900' : 'text-slate-600'}`}
          >
            All Stock
          </button>
          <button
            type="button"
            onClick={() => onStockFilterChange('negative')}
            className={`px-2 py-1 rounded font-medium ${stockFilter === 'negative' ? 'bg-rose-100 text-rose-800' : 'text-slate-600'}`}
          >
            Negative ({negativeStockCount})
          </button>
          <button
            type="button"
            onClick={() => onStockFilterChange('zero')}
            className={`px-2 py-1 rounded font-medium ${stockFilter === 'zero' ? 'bg-amber-100 text-amber-800' : 'text-slate-600'}`}
          >
            Zero
          </button>
        </div>
      </div>
    </div>
  );
}
