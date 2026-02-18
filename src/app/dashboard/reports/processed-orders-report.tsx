
'use client';

import { useState, useMemo } from 'react';
import { DateRange } from 'react-day-picker';
import {
  startOfToday,
  endOfToday,
  format,
} from 'date-fns';
import { Calendar as CalendarIcon, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query } from 'firebase/firestore';

type Order = {
  id: string;
  customerId: string;
  orderDate: string;
  totalAmount: number;
  orderStatus: string;
  paymentType: string;
  shippingDetails?: string;
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
};

type OrderItem = {
    id: string;
    orderId: string;
    productName: string;
    quantity: number;
}

export function ProcessedOrdersReport() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfToday(),
    to: endOfToday(),
  });

  const firestore = useFirestore();
  const { user } = useUser();

  const allOrdersQuery = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'orders')) : null), [firestore, user]);
  const { data: allOrders, isLoading: isLoadingOrders } = useCollection<Order>(allOrdersQuery);

  const customersQuery = useMemoFirebase(() => (firestore && user ? collection(firestore, 'customers') : null), [firestore, user]);
  const { data: customers, isLoading: isLoadingCustomers } = useCollection<Customer>(customersQuery);

  const itemsQuery = useMemoFirebase(() => (firestore && user ? collection(firestore, 'orderItems') : null), [firestore, user]);
  const { data: allOrderItems, isLoading: isLoadingItems } = useCollection<OrderItem>(itemsQuery);

  const isLoading = isLoadingOrders || isLoadingCustomers || isLoadingItems;

  const customerMap = useMemo(() => {
    if (!customers) return new Map();
    return new Map(customers.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  }, [customers]);

  const orders = useMemo(() => {
    if (!allOrders || !date?.from || !date?.to) return [];
    const fromTime = date.from.getTime();
    const toTime = date.to.getTime();
    return allOrders.filter(order => {
        const orderTime = new Date(order.orderDate).getTime();
        return orderTime >= fromTime && orderTime <= toTime && order.orderStatus === 'Processing';
    }).map(o => ({
        ...o,
        customerName: customerMap.get(o.customerId) || 'Unknown Customer',
        items: allOrderItems?.filter(i => i.orderId === o.id) || []
    }));
  }, [allOrders, date, customerMap, allOrderItems]);

  const handlePrint = () => {
    window.print();
  };

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
                <Printer className="mr-2 h-4 w-4" /> Print Batch
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
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

        {/* --- PRINT ONLY CONTENT: SUMMARY SHEET --- */}
        <div className="hidden print:block mb-8">
            <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-2">
                <h1 className="text-2xl font-bold uppercase">Order Batch Summary</h1>
                <div className="text-right text-sm">
                    <p>Date Printed: {format(new Date(), 'PPPP p')}</p>
                    <p>Total Orders: {orders.length}</p>
                </div>
            </div>
            <table className="w-full border-collapse border border-black">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-black px-2 py-1 text-left text-xs uppercase">Order ID</th>
                        <th className="border border-black px-2 py-1 text-left text-xs uppercase">Customer Name</th>
                        <th className="border border-black px-2 py-1 text-left text-xs uppercase">Notes / Shipping Details</th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map(order => (
                        <tr key={order.id}>
                            <td className="border border-black px-2 py-1 text-sm font-mono">{order.id.substring(0, 7).toUpperCase()}</td>
                            <td className="border border-black px-2 py-1 text-sm font-bold">{order.customerName}</td>
                            <td className="border border-black px-2 py-1 text-xs">{order.shippingDetails || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="page-break-after" />
        </div>

        {/* --- MAIN LIST VIEW --- */}
        <div className="print:hidden">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Items</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                </TableRow>
                ))}
                {orders.map((order) => (
                <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.id.substring(0, 7).toUpperCase()}</TableCell>
                    <TableCell className="font-medium">{order.customerName}</TableCell>
                    <TableCell>{format(new Date(order.orderDate), 'PPP p')}</TableCell>
                    <TableCell className="text-right">{order.items.length}</TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
            {!isLoading && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                <p className="text-lg font-semibold">No Processing Orders Found</p>
                <p className="text-muted-foreground mt-2">Filter a different date or process more orders.</p>
            </div>
            )}
        </div>

        {/* --- PRINT ONLY CONTENT: INDIVIDUAL ORDER SHEETS --- */}
        <div className="hidden print:block">
            {orders.map((order, idx) => (
                <div key={order.id} className={cn("border border-black p-6 mb-8", idx < orders.length - 1 && "page-break-after")}>
                    <div className="flex justify-between items-start border-b border-black pb-4 mb-4">
                        <div>
                            <h2 className="text-xl font-bold">Order #{order.id.substring(0, 7).toUpperCase()}</h2>
                            <p className="text-sm">{format(new Date(order.orderDate), 'PPPP p')}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold">{order.customerName}</p>
                            <p className="text-xs text-gray-600">Status: {order.orderStatus}</p>
                        </div>
                    </div>
                    <div className="mb-6">
                        <h3 className="font-bold mb-2 uppercase text-xs">Fulfillment List:</h3>
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-black">
                                    <th className="text-left py-1 text-sm">Product Name</th>
                                    <th className="text-right py-1 text-sm">Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map(item => (
                                    <tr key={item.id} className="border-b border-gray-200">
                                        <td className="py-2 text-sm">{item.productName}</td>
                                        <td className="py-2 text-right font-bold">{item.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {order.shippingDetails && (
                        <div className="bg-gray-50 p-4 border border-gray-300">
                            <h3 className="font-bold mb-1 uppercase text-xs">Shipping Notes:</h3>
                            <p className="text-sm italic">{order.shippingDetails}</p>
                        </div>
                    )}
                </div>
            ))}
        </div>
      </CardContent>
      <style jsx global>{`
        @media print {
            body * { visibility: hidden; }
            .print\:block, .print\:block * { visibility: visible; }
            .print\:block { position: absolute; left: 0; top: 0; width: 100%; }
            .page-break-after { page-break-after: always; }
            @page { margin: 1cm; }
        }
      `}</style>
    </Card>
  );
}
