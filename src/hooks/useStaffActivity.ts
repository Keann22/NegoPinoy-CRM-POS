'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import type {
  ActivityCategory,
  ActivityDatePreset,
  StaffActivityItem,
  StaffActivityPersonOption,
  StaffActivityResponse,
  StaffActivitySummary,
} from '@/types';

const EMPTY_SUMMARY: StaffActivitySummary = {
  totalActions: 0,
  byCategory: {
    picking: 0,
    checking: 0,
    packing: 0,
    receiving: 0,
    counting: 0,
    transfers: 0,
    returns: 0,
    tasks: 0,
    shipping: 0,
  },
  receivedPieces: 0,
  countsMatched: 0,
  countsTotal: 0,
};

export function useStaffActivity(initialPreset: ActivityDatePreset = 'today') {
  const [preset, setPreset] = useState<ActivityDatePreset>(initialPreset);
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [category, setCategory] = useState<ActivityCategory | 'all'>('all');
  const [personKey, setPersonKey] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  const [items, setItems] = useState<StaffActivityItem[]>([]);
  const [summary, setSummary] = useState<StaffActivitySummary>(EMPTY_SUMMARY);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [resolvedPersonKey, setResolvedPersonKey] = useState('me');
  const [resolvedPersonName, setResolvedPersonName] = useState('');
  const [isManagement, setIsManagement] = useState(false);
  const [staffOptions, setStaffOptions] = useState<StaffActivityPersonOption[]>([]);
  const [dateRangeMeta, setDateRangeMeta] = useState<{ from: string; to: string }>({
    from: '',
    to: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const buildUrl = useCallback(
    (offset: number, limit = 50) => {
      const params = new URLSearchParams();
      params.set('preset', preset);
      if (preset === 'custom' && customRange?.from) {
        params.set('from', format(customRange.from, 'yyyy-MM-dd'));
        params.set('to', format(customRange.to || customRange.from, 'yyyy-MM-dd'));
      }
      if (category !== 'all') params.set('category', category);
      if (personKey && personKey !== 'all') params.set('personKey', personKey);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      return `/api/inventory/activity?${params.toString()}`;
    },
    [preset, customRange, category, personKey, debouncedSearch]
  );

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (preset === 'custom' && !customRange?.from) return;

      if (!append) {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const res = await fetch(buildUrl(offset), {
          signal: append ? undefined : abortRef.current?.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${res.status})`);
        }
        const data: StaffActivityResponse = await res.json();
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setSummary(data.summary);
        setTotalFiltered(data.totalFiltered);
        setHasMore(data.hasMore);
        setResolvedPersonKey(data.resolvedPersonKey);
        setResolvedPersonName(data.resolvedPersonName);
        setIsManagement(data.isManagement);
        setStaffOptions(data.staffOptions);
        setDateRangeMeta({ from: data.dateRange.from, to: data.dateRange.to });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load activity');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [buildUrl, preset, customRange]
  );

  useEffect(() => {
    fetchPage(0, false);
    return () => abortRef.current?.abort();
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    fetchPage(items.length, true);
  }, [hasMore, isLoadingMore, fetchPage, items.length]);

  const refresh = useCallback(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  const resetFilters = useCallback(() => {
    setPreset('today');
    setCustomRange(undefined);
    setCategory('all');
    setPersonKey('all');
    setSearch('');
  }, []);

  return {
    preset,
    setPreset,
    customRange,
    setCustomRange,
    category,
    setCategory,
    personKey,
    setPersonKey,
    search,
    setSearch,
    items,
    summary,
    totalFiltered,
    hasMore,
    resolvedPersonKey,
    resolvedPersonName,
    isManagement,
    staffOptions,
    dateRangeMeta,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    refresh,
    resetFilters,
  };
}

export function useTodayStaffActivity() {
  const [data, setData] = useState<StaffActivityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/inventory/activity?preset=today&personKey=me&limit=5', {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json: StaffActivityResponse = await res.json();
      setData(json);
    } catch {
      // Non-critical dashboard summary card
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, refresh };
}
