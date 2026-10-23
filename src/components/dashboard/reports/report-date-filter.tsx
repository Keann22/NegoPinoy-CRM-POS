'use client';

import React from 'react';
import { DateRange } from 'react-day-picker';
import { format, subMonths, startOfToday, endOfToday, startOfYesterday, endOfYesterday } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReportDateFilterProps {
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
  className?: string;
}

export function ReportDateFilter({ date, setDate, className }: ReportDateFilterProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const activePreset = React.useMemo(() => {
    if (!date?.from || !date?.to) return '';
    const now = new Date();
    const fromStr = date.from.toDateString();
    const toStr = date.to.toDateString();

    if (fromStr === startOfToday().toDateString() && toStr === endOfToday().toDateString()) return 'today';
    if (fromStr === startOfYesterday().toDateString() && toStr === endOfYesterday().toDateString()) return 'yesterday';

    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toDateString();
    const curMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toDateString();
    if (fromStr === curMonthStart && toStr === curMonthEnd) return 'this-month';

    const lastMonth = subMonths(now, 1);
    const lastMonthStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1).toDateString();
    const lastMonthEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).toDateString();
    if (fromStr === lastMonthStart && toStr === lastMonthEnd) return 'last-month';

    const threeMonthsAgo = subMonths(now, 3).toDateString();
    if (fromStr === threeMonthsAgo && toStr === endOfToday().toDateString()) return 'last-3-months';

    const sixMonthsAgo = subMonths(now, 6).toDateString();
    if (fromStr === sixMonthsAgo && toStr === endOfToday().toDateString()) return 'last-6-months';

    const yearStart = new Date(now.getFullYear(), 0, 1).toDateString();
    const yearEnd = new Date(now.getFullYear(), 11, 31).toDateString();
    if (fromStr === yearStart && toStr === yearEnd) return 'this-year';

    return 'custom';
  }, [date]);

  const handlePresetChange = (value: string) => {
    const now = new Date();
    if (value === 'today') {
      setDate({ from: startOfToday(), to: endOfToday() });
    } else if (value === 'yesterday') {
      setDate({ from: startOfYesterday(), to: endOfYesterday() });
    } else if (value === 'this-month') {
      setDate({
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      });
    } else if (value === 'last-month') {
      const lastMonth = subMonths(now, 1);
      setDate({
        from: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1),
        to: new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0, 23, 59, 59, 999),
      });
    } else if (value === 'last-3-months') {
      setDate({ from: subMonths(now, 3), to: endOfToday() });
    } else if (value === 'last-6-months') {
      setDate({ from: subMonths(now, 6), to: endOfToday() });
    } else if (value === 'this-year') {
      setDate({
        from: new Date(now.getFullYear(), 0, 1),
        to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
      });
    }
  };

  if (!mounted) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2 mb-4 animate-pulse", className)}>
        <div className="h-9 w-[250px] bg-muted rounded-md"></div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2 mb-4", className)}>
      <span className="text-sm font-medium">Filter by:</span>
      <Select value={activePreset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Select a preset" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="this-month">This Month</SelectItem>
          <SelectItem value="last-month">Last Month</SelectItem>
          <SelectItem value="last-3-months">Last 3 Months</SelectItem>
          <SelectItem value="last-6-months">Last 6 Months</SelectItem>
          <SelectItem value="this-year">This Year</SelectItem>
          {activePreset === 'custom' && (
            <SelectItem value="custom" disabled>Custom Range</SelectItem>
          )}
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            size="sm"
            className={cn(
              "w-[240px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from || new Date()}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
