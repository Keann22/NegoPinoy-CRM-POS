'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { format, isValid } from 'date-fns';
import { Calendar as CalendarIcon, Printer, CheckCircle, Check, Undo2, Search } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useProcessedOrders } from '@/hooks/useProcessedOrders';
import { ProcessedOrdersPrintLayout } from '@/components/dashboard/reports/processed-orders-print-layout';

export function ProcessedOrdersReport() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const {
    date,
    setDate,
    activeTab,
    setActiveTab,
    selectedOrderIds,
    searchTerm,
    setSearchTerm,
    orders,
    isLoading,
    handleMarkBatchPrinted,
    togglePrintStatus,
    toggleSelectAll,
    toggleSelect
  } = useProcessedOrders();

  const handlePrint = () => {
    window.print();
  };

  if (!mounted) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading orders...</div>;
  }

  return (
    <Card className="print:shadow-none print:border-none">
      <CardHeader className="print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="font-headline">Processed Orders (Batch Printing)</CardTitle>
            <CardDescription>View and print orders currently in "Processing" state.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={orders.length === 0}>
                <Printer className="mr-2 h-4 w-4" /> {selectedOrderIds.size > 0 ? `Print Selected (${selectedOrderIds.size})` : 'Print All'}
            </Button>
            {activeTab === 'to-print' && orders.length > 0 && (
                <Button variant="default" size="sm" onClick={handleMarkBatchPrinted}>
                    <CheckCircle className="mr-2 h-4 w-4" /> {selectedOrderIds.size > 0 ? 'Mark Selected as Printed' : 'Mark Batch as Printed'}
                </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 print:hidden">
            <div className="flex items-center flex-wrap gap-4">
                <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
                    <TabsList>
                        <TabsTrigger value="to-print">To Print</TabsTrigger>
                        <TabsTrigger value="printed">Already Printed</TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="relative w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search name or ID..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 h-9"
                    />
                </div>
            </div>
            <Popover>
                <PopoverTrigger asChild>
                <Button variant={"outline"} size="sm" className={cn("w-[240px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date?.from ? (date.to ? <>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</> : format(date.from, "LLL dd, y")) : <span>Pick a date</span>}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
                </PopoverContent>
            </Popover>
        </div>

        {/* --- MAIN LIST VIEW --- */}
        <div className="print:hidden">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead className="w-12 text-center">
                    <input 
                        type="checkbox" 
                        className="w-4 h-4 cursor-pointer"
                        checked={orders.length > 0 && selectedOrderIds.size === orders.length}
                        onChange={toggleSelectAll}
                    />
                </TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-center w-16">Action</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-6 mx-auto" /></TableCell>
                </TableRow>
                ))}
                {orders.map((order) => (
                <TableRow key={order.id || Math.random().toString()} className={selectedOrderIds.has(order.id) ? "bg-muted/50" : ""}>
                    <TableCell className="text-center">
                        <input 
                            type="checkbox" 
                            className="w-4 h-4 cursor-pointer"
                            checked={selectedOrderIds.has(order.id)}
                            onChange={() => toggleSelect(order.id)}
                        />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                        {order.id ? (
                            <Link href={`/dashboard/orders/${order.id}`} className="font-semibold text-primary hover:underline">
                                {order.id.substring(0, 7).toUpperCase()}
                            </Link>
                        ) : 'N/A'}
                    </TableCell>
                    <TableCell className="font-medium">
                        {order.customerId ? (
                            <Link href={`/dashboard/customers/${order.customerId}`} className="text-primary hover:underline">
                                {order.customerName}
                            </Link>
                        ) : order.customerName}
                    </TableCell>
                    <TableCell>{order.orderDate && isValid(new Date(order.orderDate)) ? format(new Date(order.orderDate), 'PPP p') : '—'}</TableCell>
                    <TableCell>
                        <span className={cn(
                            "px-2 py-1 rounded-full text-xs font-semibold",
                            ['Pending Payment', 'Processing'].includes(order.orderStatus) 
                                ? "bg-amber-100 text-amber-800" 
                                : "bg-green-100 text-green-800"
                        )}>
                            {order.orderStatus}
                        </span>
                    </TableCell>
                    <TableCell className="text-right">{order.items?.length || 0}</TableCell>
                    <TableCell className="text-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            title={order.isPrinted ? "Mark as To Print" : "Mark as Printed"}
                            onClick={() => togglePrintStatus(order.id, !!order.isPrinted)}
                        >
                            {order.isPrinted ? (
                                <Undo2 className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <Check className="h-4 w-4 text-muted-foreground" />
                            )}
                        </Button>
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
            {!isLoading && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                <p className="text-lg font-semibold">No Orders Found</p>
                <p className="text-muted-foreground mt-2">There are no orders in the {activeTab === 'to-print' ? '"To Print"' : '"Already Printed"'} list.</p>
            </div>
            )}
        </div>

        {/* --- PRINT ONLY CONTENT --- */}
        <ProcessedOrdersPrintLayout 
          orders={orders} 
          selectedOrderIds={selectedOrderIds} 
          activeTab={activeTab} 
        />
      </CardContent>
      <style>{`
        @media print {
            .print\\:hidden { display: none !important; }
            #print-area { display: block !important; }
            .page-break-after { page-break-after: always; }
            @page { margin: 1cm; }
        }
      `}</style>
    </Card>
  );
}