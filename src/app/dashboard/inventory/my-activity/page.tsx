'use client';

import { format } from 'date-fns';
import { Calendar as CalendarIcon, FilterX, History, RefreshCw, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useStaffActivity } from '@/hooks/useStaffActivity';
import { ActivitySummaryStrip } from '@/components/dashboard/inventory/activity-summary-strip';
import { ActivityTimeline } from '@/components/dashboard/inventory/activity-timeline';
import type { ActivityCategory, ActivityDatePreset } from '@/types';

const CATEGORY_OPTIONS: { value: ActivityCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'picking', label: 'Picking' },
  { value: 'checking', label: 'Second Check' },
  { value: 'packing', label: 'Packing' },
  { value: 'receiving', label: 'Receiving & Stock' },
  { value: 'counting', label: 'Shelf Counts' },
  { value: 'transfers', label: '3C ⇄ 4A Transfers' },
  { value: 'returns', label: 'Returns' },
  { value: 'tasks', label: 'Tasks & Notes' },
  { value: 'shipping', label: 'Bus Shipping' },
];

export default function MyActivityPage() {
  const {
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
  } = useStaffActivity('today');

  const hasNonDefaultFilters =
    preset !== 'today' ||
    category !== 'all' ||
    (isManagement && personKey !== 'all') ||
    search.trim().length > 0;

  const inventoryStaff = staffOptions.filter((s) => s.isInventoryTeam);
  const otherStaff = staffOptions.filter((s) => !s.isInventoryTeam);

  const pageTitle =
    isManagement && personKey !== 'me' ? 'Inventory Staff Activity' : 'My Activity';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <History className="h-7 w-7 text-primary mt-0.5 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold font-headline tracking-tight">{pageTitle}</h1>
            <p className="text-sm text-muted-foreground">
              {resolvedPersonName ? `${resolvedPersonName} · ` : ''}
              {dateRangeMeta.from && dateRangeMeta.to
                ? dateRangeMeta.from === dateRangeMeta.to
                  ? dateRangeMeta.from
                  : `${dateRangeMeta.from} to ${dateRangeMeta.to}`
                : 'Loading range...'}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          value={preset}
          onValueChange={(v) => setPreset(v as ActivityDatePreset)}
        >
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        {preset === 'custom' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-[230px] justify-start text-left font-normal bg-background',
                  !customRange?.from && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {customRange?.from ? (
                  customRange.to ? (
                    <>
                      {format(customRange.from, 'LLL dd, y')} -{' '}
                      {format(customRange.to, 'LLL dd, y')}
                    </>
                  ) : (
                    format(customRange.from, 'LLL dd, y')
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={customRange?.from}
                selected={customRange}
                onSelect={setCustomRange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        )}

        {isManagement && (
          <Select value={personKey} onValueChange={setPersonKey}>
            <SelectTrigger className="w-[210px] bg-background">
              <Users className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Select staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Inventory Staff</SelectItem>
              <SelectItem value="me">My Activity</SelectItem>
              {inventoryStaff.map((person) => (
                <SelectItem key={person.key} value={person.key}>
                  {person.name}
                </SelectItem>
              ))}
              {otherStaff.map((person) => (
                <SelectItem key={person.key} value={person.key}>
                  {person.name} ({person.roles.join(', ')})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={category}
          onValueChange={(v) => setCategory(v as ActivityCategory | 'all')}
        >
          <SelectTrigger className="w-[180px] bg-background">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, product, or note..."
            className="pl-8 bg-background"
          />
        </div>

        {hasNonDefaultFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <FilterX className="h-4 w-4" />
            Reset
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <ActivitySummaryStrip
        summary={summary}
        selectedCategory={category}
        onSelectCategory={setCategory}
      />

      <ActivityTimeline
        items={items}
        totalFiltered={totalFiltered}
        hasMore={hasMore}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        showActor={isManagement && personKey === 'all'}
        onLoadMore={loadMore}
      />
    </div>
  );
}
