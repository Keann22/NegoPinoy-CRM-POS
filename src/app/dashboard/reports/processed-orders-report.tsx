'use client';

import { useState, useMemo, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import {
  startOfMonth,
  endOfMonth,
  format,
  isValid,
} from 'date-fns';
import { Calendar as CalendarIcon, Printer, CheckCircle, Check, Undo2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useUser, useSupabase } from '@/firebase';

type Order = {
  id: string;
  customerId: string;
  orderDate: string;
  totalAmount: number;
  orderStatus: string;
  paymentType: string;
  shippingDetails?: string;
  customerName?: string;
  customerAddress?: string;
  customerMobile?: string;
  salesPersonName?: string;
  isPrinted?: boolean;
  items?: OrderItem[];
};

type OrderItem = {
    id: string;
    orderId: string;
    productName: string;
    quantity: number;
    sellingPriceAtSale?: number;
}

export function ProcessedOrdersReport() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [activeTab, setActiveTab] = useState<'to-print' | 'printed' | 'reprint'>('to-print');
  const [reprintOrderId, setReprintOrderId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Clear selection when tab changes
  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [activeTab]);

  const toggleSelectAll = () => {
      if (selectedOrderIds.size === enrichedOrders.length) {
          setSelectedOrderIds(new Set());
      } else {
          setSelectedOrderIds(new Set(enrichedOrders.map(o => o.id)));
      }
  };

  const toggleSelect = (id: string) => {
      const next = new Set(selectedOrderIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedOrderIds(next);
  };

  useEffect(() => {
    if (reprintOrderId) {
      const timer = setTimeout(() => {
        window.print();
        setReprintOrderId(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [reprintOrderId]);

  const supabase = useSupabase();
  const { user } = useUser();

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [enrichedOrders, setEnrichedOrders] = useState<Order[]>([]);

  // Step 1: Load all orders
  useEffect(() => {
    if (!supabase || !user) return;
    const fetchOrders = async () => {
      setIsLoadingOrders(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, customer_id, created_at, status, payment_method, total_amount, notes, sales_person_name, is_printed')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const mapped = (data || []).map((o: any) => ({
          id: o.id,
          customerId: o.customer_id,
          orderDate: o.created_at,
          orderStatus: o.status,
          paymentType: o.payment_method,
          totalAmount: Number(o.total_amount),
          shippingDetails: o.notes,
          salesPersonName: o.sales_person_name || null,
          isPrinted: o.is_printed || false,
        }));
        setAllOrders(mapped);
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setIsLoadingOrders(false);
      }
    };
    fetchOrders();
  }, [supabase, user]);

  // Step 2: Filter orders by date range and status
  const filteredOrders = useMemo(() => {
    if (!allOrders || !date?.from || !date?.to) return [];
    const fromTime = date.from.getTime();
    const toDate = new Date(date.to);
    toDate.setHours(23, 59, 59, 999);
    const toTime = toDate.getTime();

    const filtered = allOrders.filter(order => {
      const orderTime = new Date(order.orderDate).getTime();
      const withinDate = orderTime >= fromTime && orderTime <= toTime;
      const validStatus = order.orderStatus !== 'Cancelled' && order.orderStatus !== 'Returned';
      const matchesTab = activeTab === 'reprint' ? true : (activeTab === 'to-print' ? !order.isPrinted : !!order.isPrinted);
      
      return withinDate && validStatus && matchesTab;
    });

    // Sort: 1. Unshipped first, 2. Older first
    return filtered.sort((a, b) => {
        const aPending = ['Pending Payment', 'Processing'].includes(a.orderStatus) ? 0 : 1;
        const bPending = ['Pending Payment', 'Processing'].includes(b.orderStatus) ? 0 : 1;
        
        if (aPending !== bPending) return aPending - bPending;
        
        return new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
    });
  }, [allOrders, date, activeTab]);

  // Step 3: Enrich filtered orders with customer names and order items
  useEffect(() => {
    if (!supabase || filteredOrders.length === 0) {
      setEnrichedOrders(filteredOrders.map(o => ({ ...o, customerName: 'Unknown Customer', items: [] })));
      return;
    }

    const enrich = async () => {
      setIsLoadingDetails(true);
      try {
        const orderIds = filteredOrders.map(o => o.id);
        const customerIds = Array.from(new Set(filteredOrders.map(o => o.customerId)));

        // Fetch customers for these orders only
        const { data: customersData } = await supabase
          .from('customers')
          .select('id, full_name, address_line, mobile_number')
          .in('id', customerIds);

        const customerMap = new Map<string, any>();
        (customersData || []).forEach((c: any) => {
          customerMap.set(c.id, {
              name: c.full_name || 'Unknown Customer',
              address: c.address_line || '',
              mobile: c.mobile_number || ''
          });
        });

        // Fetch order items for these orders only
        const { data: itemsData } = await supabase
          .from('order_items')
          .select('id, order_id, quantity, selling_price_at_sale, product_id, products(name)')
          .in('order_id', orderIds);

        // Group items by order_id
        const itemsMap = new Map<string, OrderItem[]>();
        (itemsData || []).forEach((item: any) => {
          const existing = itemsMap.get(item.order_id) || [];
          existing.push({
            id: item.id,
            orderId: item.order_id,
            productName: item.products?.name || 'Unknown Product',
            quantity: item.quantity,
            sellingPriceAtSale: item.selling_price_at_sale,
          });
          itemsMap.set(item.order_id, existing);
        });

        const enriched = filteredOrders.map(order => {
          const cust = customerMap.get(order.customerId) || { name: 'Unknown Customer', address: '', mobile: '' };
          return {
            ...order,
            customerName: cust.name,
            customerAddress: cust.address,
            customerMobile: cust.mobile,
            items: itemsMap.get(order.id) || [],
          };
        });

        setEnrichedOrders(enriched);
      } catch (err) {
        console.error('Error enriching orders:', err);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    enrich();
  }, [filteredOrders, supabase]);

  const isLoading = isLoadingOrders || isLoadingDetails;
  const orders = enrichedOrders;



  const handlePrint = () => {
    window.print();
  };

  const handleMarkBatchPrinted = async () => {
    if (!supabase || orders.length === 0) return;
    try {
        const orderIds = selectedOrderIds.size > 0 ? Array.from(selectedOrderIds) : orders.map(o => o.id);
        await supabase.from('orders').update({ is_printed: true }).in('id', orderIds);
        setAllOrders(prev => prev.map(o => orderIds.includes(o.id) ? { ...o, isPrinted: true } : o));
        setSelectedOrderIds(new Set());
    } catch (err) {
        console.error('Error marking batch as printed:', err);
    }
  };

  const togglePrintStatus = async (orderId: string, currentStatus: boolean) => {
    if (!supabase) return;
    try {
        await supabase.from('orders').update({ is_printed: !currentStatus }).eq('id', orderId);
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, isPrinted: !currentStatus } : o));
    } catch (err) {
        console.error('Error toggling print status:', err);
    }
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
            {activeTab !== 'reprint' && (
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={orders.length === 0}>
                    <Printer className="mr-2 h-4 w-4" /> {selectedOrderIds.size > 0 ? `Print Selected (${selectedOrderIds.size})` : 'Print All'}
                </Button>
            )}
            {activeTab === 'to-print' && orders.length > 0 && (
                <Button variant="default" size="sm" onClick={handleMarkBatchPrinted}>
                    <CheckCircle className="mr-2 h-4 w-4" /> {selectedOrderIds.size > 0 ? 'Mark Selected as Printed' : 'Mark Batch as Printed'}
                </Button>
            )}
            {activeTab === 'reprint' && (
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={selectedOrderIds.size === 0}>
                    <Printer className="mr-2 h-4 w-4" /> {selectedOrderIds.size > 0 ? `Print Selected (${selectedOrderIds.size})` : 'Print Selected'}
                </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 print:hidden">
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
                <TabsList>
                    <TabsTrigger value="to-print">To Print</TabsTrigger>
                    <TabsTrigger value="printed">Already Printed</TabsTrigger>
                    <TabsTrigger value="reprint">Reprint</TabsTrigger>
                </TabsList>
            </Tabs>
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
                    <TableCell className="font-mono text-xs">{order.id ? order.id.substring(0, 7).toUpperCase() : 'N/A'}</TableCell>
                    <TableCell className="font-medium">{order.customerName}</TableCell>
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
                        {activeTab === 'reprint' ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                title="Reprint Order"
                                onClick={() => setReprintOrderId(order.id)}
                            >
                                <Printer className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        ) : (
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
                        )}
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
            {!isLoading && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                <p className="text-lg font-semibold">No Orders Found</p>
                <p className="text-muted-foreground mt-2">There are no orders in the {activeTab === 'to-print' ? '"To Print"' : activeTab === 'printed' ? '"Already Printed"' : '"Reprint Single"'} list.</p>
            </div>
            )}
        </div>

        {/* --- PRINT ONLY CONTENT --- */}
        <div id="print-area" className="hidden print:block w-full bg-white printable-area">
            {(() => {
                const printOrders = activeTab === 'reprint' && reprintOrderId 
                    ? orders.filter(o => o.id === reprintOrderId) 
                    : (selectedOrderIds.size > 0 ? orders.filter(o => selectedOrderIds.has(o.id)) : orders);
                
                return (
                    <>
                        {!(activeTab === 'reprint' && reprintOrderId) && (
                        <div className="mb-8">
                            <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-2">
                                <h1 className="text-2xl font-bold uppercase">Order Batch Summary</h1>
                                <div className="text-right text-sm">
                                    <p>Date Printed: {format(new Date(), 'PPPP p')}</p>
                                    <p>Total Orders: {printOrders.length}</p>
                                </div>
                            </div>
                            <table className="w-full border-collapse border border-black">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[15%]">Order ID</th>
                                        <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[25%]">Customer Name</th>
                                        <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[15%]">Status</th>
                                        <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[45%]">Notes / Shipping Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {printOrders.map(order => (
                                        <tr key={order.id}>
                                            <td className="border border-black px-2 py-1 text-sm font-mono">{order.id.substring(0, 7).toUpperCase()}</td>
                                            <td className="border border-black px-2 py-1 text-sm font-bold">{order.customerName}</td>
                                            <td className="border border-black px-2 py-1 text-xs font-semibold">{order.orderStatus}</td>
                                            <td className="border border-black px-2 py-1 text-xs">{order.shippingDetails || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="page-break-after" />
                        </div>
                        )}

                        <div className="font-sans text-sm pb-10">
                            {printOrders.map((order, idx, arr) => (
                    <div key={order.id} className="mb-4 break-inside-avoid">
                        <div className="border-2 border-black flex flex-col">
                            {/* Header Section */}
                            <div className="flex border-b-2 border-black items-center">
                                <div className="flex-1 p-2 border-r-2 border-black">
                                    <div className="font-bold">Negosyanteng Pinoy PH</div>
                                    <div className="text-xs">http://facebook.com/NegoPinoyPH</div>
                                </div>
                                <div className="flex-1 p-2 text-xs border-r-2 border-black">
                                    <div className="font-bold text-base">Order #{order.id.substring(0, 7).toUpperCase()}</div>
                                    <div>Created At: {order.orderDate && isValid(new Date(order.orderDate)) ? format(new Date(order.orderDate), 'MM/dd/yyyy') : '—'}</div>
                                </div>
                                <div className="p-2 flex justify-center items-center">
                                    <QRCodeCanvas value={order.id} size={50} />
                                </div>
                            </div>
                            
                            {/* Recipient Section */}
                            <div className="flex flex-col p-2 border-b-2 border-black">
                                <div className="flex">
                                    <span className="mr-1">Recipient:</span>
                                    <div className="flex-1">
                                        <div className="font-bold">{order.customerName}</div>
                                    </div>
                                </div>
                                {order.customerMobile && (
                                    <div className="text-xs mt-1">
                                        <span className="font-semibold">Contact: </span>{order.customerMobile}
                                    </div>
                                )}
                                {order.customerAddress && (
                                    <div className="text-xs">
                                        <span className="font-semibold">Address: </span>{order.customerAddress}
                                    </div>
                                )}
                            </div>
                            
                            {/* Items Table */}
                            <div className="min-h-[120px] pb-2">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b-2 border-black text-left">
                                            <th className="py-1 px-2 font-normal w-8">#</th>
                                            <th className="py-1 px-2 font-normal">Product</th>
                                            <th className="py-1 px-2 font-normal text-right w-12">Qty</th>
                                            <th className="py-1 px-2 font-normal text-right w-24">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {order.items.map((item, i) => (
                                            <tr key={item.id}>
                                                <td className="py-1 px-2 align-top">{i + 1}</td>
                                                <td className="py-1 px-2 align-top">{item.productName}</td>
                                                <td className="py-1 px-2 align-top text-right">{item.quantity}</td>
                                                <td className="py-1 px-2 align-top text-right whitespace-nowrap font-semibold">
                                                    ₱ {(item.sellingPriceAtSale ?? 0) * item.quantity}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* Footer Section */}
                            <div className="flex border-t-2 border-black">
                                <div className="w-2/3 p-2 border-r-2 border-black text-xs whitespace-pre-wrap min-h-[70px]">
                                    <div className="font-bold uppercase mb-1">{order.paymentType}</div>
                                    {order.shippingDetails && (
                                        <div>
                                            <span className="font-semibold">Notes: </span>
                                            <span>{order.shippingDetails}</span>
                                        </div>
                                    )}
                                    {order.salesPersonName && (
                                        <div className="mt-1 text-gray-500">Processed by: <span className="font-semibold text-black">{order.salesPersonName}</span></div>
                                    )}
                                </div>
                                <div className="w-1/3 p-2 text-sm flex items-center">
                                    <div>Collection (COD): <span className="font-bold whitespace-nowrap">₱ {order.totalAmount}</span></div>
                                </div>
                            </div>
                        </div>
                        {/* Dashed separator between orders, except after the last one */}
                        {idx < arr.length - 1 && (
                            <div className="mt-4 border-b-[3px] border-dashed border-gray-600 w-full" />
                        )}
                    </div>
                ))}
            </div>
            </>
            );
            })()}
        </div>
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