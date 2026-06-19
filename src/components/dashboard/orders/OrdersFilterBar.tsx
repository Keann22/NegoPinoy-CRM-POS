'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Calendar as CalendarIcon, FilterX, Search } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { ORDER_STATUSES } from '@/types';
import type { OrderStatus } from '@/types';

interface OrdersFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusChange: (s: string) => void;
  typeFilter: string;
  onTypeChange: (t: string) => void;
  date: DateRange | undefined;
  onDateChange: (d: DateRange | undefined) => void;
  selectedOrderIds: string[];
  onBulkStatusChange: (status: OrderStatus) => void;
}

export function OrdersFilterBar({
  searchQuery, onSearchChange,
  statusFilter, onStatusChange,
  typeFilter, onTypeChange,
  date, onDateChange,
  selectedOrderIds, onBulkStatusChange,
}: OrdersFilterBarProps) {
  const hasActiveFilters = !!(date || statusFilter !== 'all' || typeFilter !== 'all' || searchQuery.trim() !== '');

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search name or ID..."
          className="w-full bg-background pl-8 md:w-[200px] lg:w-[300px]"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('w-[240px] justify-start text-left font-normal', !date && 'text-muted-foreground')}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from
              ? date.to
                ? <>{format(date.from, 'LLL dd, y')} - {format(date.to, 'LLL dd, y')}</>
                : format(date.from, 'LLL dd, y')
              : <span>Filter by date</span>
            }
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={onDateChange} numberOfMonths={2} />
        </PopoverContent>
      </Popover>

      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={typeFilter} onValueChange={onTypeChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="Full Payment">Full Payment</SelectItem>
          <SelectItem value="Lay-away">Lay-away</SelectItem>
          <SelectItem value="Installment">Installment</SelectItem>
          <SelectItem value="COD">COD</SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" onClick={() => { onDateChange(undefined); onStatusChange('all'); onTypeChange('all'); onSearchChange(''); }} className="text-muted-foreground hover:text-foreground">
          <FilterX className="mr-2 h-4 w-4" /> Clear Filters
        </Button>
      )}

      {selectedOrderIds.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">Update Status ({selectedOrderIds.length})</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Bulk Update Status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ORDER_STATUSES.map(status => (
              <DropdownMenuItem key={status} onClick={() => onBulkStatusChange(status)}>{status}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
