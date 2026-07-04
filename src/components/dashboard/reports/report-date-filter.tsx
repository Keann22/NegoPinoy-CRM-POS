'use client';

import React from 'react';
import { DateRange } from 'react-day-picker';
import { format, startOfToday, subMonths } from 'date-fns';
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
  } from "@/components/ui/select"

interface ReportDateFilterProps {
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
  className?: string;
}

export function ReportDateFilter({ date, setDate, className }: ReportDateFilterProps) {
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    const handlePresetChange = (value: string) => {
        const now = new Date();
        if (value === 'this-month') {
            setDate({ from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) });
        } else if (value === 'last-month') {
            const lastMonth = subMonths(now, 1);
            setDate({ from: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1), to: new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0) });
        } else if (value === 'last-3-months') {
            setDate({ from: subMonths(now, 3), to: now });
        } else if (value === 'this-year') {
            setDate({ from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) });
        }
    }

    if (!mounted) {
        return <div className={cn("flex flex-wrap items-center gap-2 mb-4 animate-pulse", className)}>
            <div className="h-9 w-[250px] bg-muted rounded-md"></div>
        </div>;
    }

  return (
    <div className={cn("flex flex-wrap items-center gap-2 mb-4", className)}>
      <span className="text-sm font-medium">Filter by:</span>
      <Select onValueChange={handlePresetChange}>
        <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Select a preset" />
        </SelectTrigger>
        <SelectContent>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="last-month">Last Month</SelectItem>
            <SelectItem value="last-3-months">Last 3 Months</SelectItem>
            <SelectItem value="this-year">This Year</SelectItem>
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
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
