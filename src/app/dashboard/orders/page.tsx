'use client';

import { MoreHorizontal, Calendar as CalendarIcon, FilterX, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AddOrderDialog } from '@/components/dashboard/order-dialog';
import { format, isValid, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useMemo, useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { LogPaymentDialog } from '@/components/dashboard/log-payment-dialog';
import { CompleteCodPaymentDialog } from '@/components/dashboard/complete-cod-payment-dialog';
import { EditPaymentTermsDialog } from '@/components/dashboard/edit-payment-terms-dialog';
import { SetDueDateDialog } from '@/components/dashboard/set-due-date-dialog';
import { MarkShippedDialog } from '@/components/dashboard/mark-shipped-dialog';
import { 
  useCollection, 
  useUser, 
  useSupabase,
  collection,
  query,
  orderBy,
  where
} from '@/firebase';
import { Progress } from '@/components/ui/progress';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserProfile } from '@/hooks/useUserProfile';


// Matches the Firestore document structure for an order
export type Order = {
  id: string;
  customerId: string;
  orderDate: string; // ISO string
  subtotal: number;
  totalDiscount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  orderStatus: 'Pending Payment' | 'Processing' | 'Packed' | 'For Shipping' | 'Shipped' | 'Completed' | 'Cancelled' | 'Returned' | 'Payment Received (COD)';
  paymentType: 'Full Payment' | 'Lay-away' | 'Installment' | 'COD' | 'Pending';
  installmentMonths?: number;
  monthlyPayment?: number;
  insurance_fee?: number;
  tracking_number?: string;
  salesPersonName?: string;
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
};

type FormattedOrder = Order & {
    customerName: string;
    formattedDate: string;
    formattedTotal: string;
};


const getStatusVariant = (status: Order['orderStatus']) => {
  switch (status) {
    case 'Shipped':
    case 'Completed':
    case 'Payment Received (COD)':
      return 'outline';
    case 'Packed':
      return 'secondary';
    case 'For Shipping':
      return 'outline';
    case 'Processing':
      return 'secondary';
    case 'Cancelled':
    case 'Returned':
        return 'destructive';
    case 'Pending Payment':
    default:
      return 'default';
  }
}

const statuses: Order['orderStatus'][] = ['Pending Payment', 'Processing', 'Packed', 'For Shipping', 'Shipped', 'Completed', 'Payment Received (COD)', 'Returned', 'Cancelled'];

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [logPaymentOrder, setLogPaymentOrder] = useState<Order | null>(null);
  const [codPaymentOrder, setCodPaymentOrder] = useState<Order | null>(null);
  const [editPaymentOrder, setEditPaymentOrder] = useState<Order | null>(null);
  const [dueDateOrder, setDueDateOrder] = useState<Order | null>(null);
  const [markShippedOrder, setMarkShippedOrder] = useState<Order | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState(searchParams?.get('search') || '');
  const { toast } = useToast();
  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();

  const isInventoryOnly = useMemo(() => userProfile?.roles.includes('Inventory') && !userProfile?.roles.includes('Sales') && !userProfile?.roles.includes('Admin') && !userProfile?.roles.includes('Owner'), [userProfile]);
  const canCreateOrder = useMemo(() => userProfile?.roles.some(r => ['Sales', 'Admin', 'Owner'].includes(r)), [userProfile]);
  const isAdminOrOwner = useMemo(() => userProfile?.roles.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);

  const ordersQuery = useMemo(
    () => {
        if (!user) return null;
        if (userProfile && !userProfile.roles.some(r => ['Admin', 'Owner', 'Inventory'].includes(r))) {
            return query(collection('orders' as any), where('sales_person_id', '==', userProfile.id), orderBy('orderDate', 'desc'));
        }
        return query(collection('orders' as any), orderBy('orderDate', 'desc'));
    },
    [user, userProfile]
  );
  const { data: orders, isLoading: isLoadingOrders, refetch } = useCollection<Order>(ordersQuery);

  const [customerMap, setCustomerMap] = useState<Map<string, string>>(new Map());
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  useEffect(() => {
    if (!orders || orders.length === 0 || !supabase) return;

    const fetchCustomers = async () => {
      setIsLoadingCustomers(true);
      try {
        const customerIds = Array.from(new Set(orders.map(o => o.customerId)));
        const map = new Map<string, string>();
        
        // Fetch only the customers we need for the current orders to avoid 1000 row limits
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name')
          .in('id', customerIds);
          
        if (error) throw error;
        
        if (data) {
          data.forEach(c => {
             map.set(c.id, c.full_name || 'Unknown Customer');
          });
        }
        setCustomerMap(map);
      } catch (err) {
        console.error('Error fetching customers for orders:', err);
      } finally {
        setIsLoadingCustomers(false);
      }
    };
    
    fetchCustomers();
  }, [orders, supabase]);
  
  const isLoading = isLoadingOrders || isLoadingCustomers;


  const formattedOrders: FormattedOrder[] = useMemo(() => {
    if (!orders) return [];

    let filtered = [...orders];

    if (statusFilter !== 'all') {
        filtered = filtered.filter(o => o.orderStatus === statusFilter);
    }
    if (typeFilter !== 'all') {
        filtered = filtered.filter(o => o.paymentType === typeFilter);
    }
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(o => 
            (o.id || '').toLowerCase().includes(query) ||
            (customerMap.get(o.customerId) || '').toLowerCase().includes(query)
        );
    }
    if (date?.from) {
        const fromTime = date.from.getTime();
        const toTime = date.to ? endOfDay(date.to).getTime() : endOfDay(date.from).getTime();
        filtered = filtered.filter(o => {
            const t = new Date(o.orderDate).getTime();
            return t >= fromTime && t <= toTime;
        });
    }

    const sortedOrders = filtered.sort((a, b) => {
        const aPending = ['Pending Payment', 'Processing'].includes(a.orderStatus) ? 0 : 1;
        const bPending = ['Pending Payment', 'Processing'].includes(b.orderStatus) ? 0 : 1;
        
        if (aPending !== bPending) return aPending - bPending;
        
        const timeA = new Date(a.orderDate).getTime();
        const timeB = new Date(b.orderDate).getTime();

        if (aPending === 0) {
           return timeA - timeB; // pending orders: oldest first
        } else {
           return timeB - timeA; // completed orders: newest first
        }
    });

    return sortedOrders.map(order => {
      const d = order.orderDate ? new Date(order.orderDate) : null;
      return {
        ...order,
        customerName: customerMap.get(order.customerId) || 'Unknown Customer',
        formattedDate: d && isValid(d) ? format(d, 'PPP') : 'Unknown Date',
        formattedTotal: `₱${(Number(order.totalAmount) || 0).toFixed(2)}`,
      };
    });
  }, [orders, customerMap, date, statusFilter, typeFilter, searchQuery]);
  

  const handleStatusChange = async (orderId: string, newStatus: Order['orderStatus']) => {
    if (!supabase) return;
    try {
      const updatePayload: any = { status: newStatus };
      if (['Shipped', 'Completed', 'Payment Received (COD)'].includes(newStatus)) {
        updatePayload.completed_at = new Date().toISOString();
      } else {
        updatePayload.completed_at = null;
      }

      const { error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId);
        
      if (error) throw error;
      
      toast({
          title: 'Order Status Updated',
          description: `Order has been set to "${newStatus}".`,
      });
    } catch (error: any) {
      console.error("Failed to update status:", error);
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    }
  };

  const handleBulkStatusChange = async (newStatus: Order['orderStatus']) => {
    if (!supabase || selectedOrderIds.length === 0) return;
    try {
      const updatePayload: any = { status: newStatus };
      if (['Shipped', 'Completed', 'Payment Received (COD)'].includes(newStatus)) {
        updatePayload.completed_at = new Date().toISOString();
      } else {
        updatePayload.completed_at = null;
      }

      const { error } = await supabase
        .from('orders')
        .update(updatePayload)
        .in('id', selectedOrderIds);
        
      if (error) throw error;
      
      toast({
          title: 'Bulk Update Successful',
          description: `${selectedOrderIds.length} orders updated to "${newStatus}".`,
      });
      setSelectedOrderIds([]);
      refetch();
    } catch (error: any) {
      console.error("Failed to bulk update status:", error);
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline">Orders</CardTitle>
            <CardDescription>
              View and manage customer sales orders.
            </CardDescription>
          </div>
          {canCreateOrder && <AddOrderDialog onOrderAdded={refetch} />}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search name or ID..."
                className="w-full bg-background pl-8 md:w-[200px] lg:w-[300px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={"outline"} className={cn("w-[240px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date?.from ? (date.to ? <>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</> : format(date.from, "LLL dd, y")) : <span>Filter by date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
              </PopoverContent>
            </Popover>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
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

            {(date || statusFilter !== 'all' || typeFilter !== 'all' || searchQuery.trim() !== '') && (
              <Button variant="ghost" onClick={() => { setDate(undefined); setStatusFilter('all'); setTypeFilter('all'); setSearchQuery(''); }} className="text-muted-foreground hover:text-foreground">
                <FilterX className="mr-2 h-4 w-4" /> Clear Filters
              </Button>
            )}

            {selectedOrderIds.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary">
                    Update Status ({selectedOrderIds.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Bulk Update Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {statuses.map(status => (
                    <DropdownMenuItem 
                      key={status} 
                      onClick={() => handleBulkStatusChange(status)}
                    >
                      {status}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox 
                    checked={formattedOrders.length > 0 && selectedOrderIds.length === formattedOrders.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedOrderIds(formattedOrders.map(o => o.id));
                      } else {
                        setSelectedOrderIds([]);
                      }
                    }}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                   <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-6 w-28 rounded-full" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                   </TableRow>
              ))}
                {formattedOrders && formattedOrders.map((order) => (
                <TableRow key={order.id || Math.random().toString()}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedOrderIds.includes(order.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedOrderIds(prev => [...prev, order.id]);
                        } else {
                          setSelectedOrderIds(prev => prev.filter(id => id !== order.id));
                        }
                      }}
                      aria-label={`Select order ${order.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{order.customerName}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {order.paymentType}
                    {order.paymentType === 'Installment' && (
                      <span className="text-muted-foreground text-xs ml-1">({order.installmentMonths || 'N/A'} mos)</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={getStatusVariant(order.orderStatus)}>
                      {order.orderStatus}
                    </Badge>
                    {order.paymentType === 'Installment' && (Number(order.totalAmount) || 0) > 0 && (
                        <div className="mt-2 w-24">
                            <Progress value={((Number(order.amountPaid) || 0) / (Number(order.totalAmount) || 1)) * 100} className="h-1" />
                            {order.installmentMonths && order.monthlyPayment && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    ₱{Number(order.monthlyPayment).toFixed(2)} / mo. for {order.installmentMonths} mos.
                                </p>
                            )}
                        </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {order.formattedDate}
                  </TableCell>
                  <TableCell className="text-right">{order.formattedTotal}</TableCell>
                  <TableCell>
                    <div className='flex justify-end'>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-haspopup="true"
                            size="icon"
                            variant="ghost"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/orders/${order.id}`)}>
                            View Details
                          </DropdownMenuItem>
                          
                          {(() => {
                            const isCompletedOrShipped = order.orderStatus === 'Completed' || order.orderStatus === 'Shipped';
                            const canEditOrder = isAdminOrOwner || userProfile?.roles?.includes('Sales') || !isCompletedOrShipped;
                            
                            return (
                              <>
                                {!isInventoryOnly && canEditOrder && (
                                  <>
                                      <DropdownMenuItem onClick={() => setLogPaymentOrder(order)}>
                                          Log Payment
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => setEditPaymentOrder(order)}>
                                          Edit Payment Terms
                                      </DropdownMenuItem>
                                  </>
                                )}
                                {(order.orderStatus === 'Shipped' || order.orderStatus === 'Processing') && (
                                    <DropdownMenuItem onClick={() => setMarkShippedOrder(order)}>
                                        {order.orderStatus === 'Shipped' ? 'Update Tracking' : 'Mark Shipped'}
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger disabled={!canEditOrder && !isInventoryOnly}>
                                    <span>Update Status</span>
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                              <DropdownMenuRadioGroup
                                value={order.orderStatus}
                                onValueChange={(newStatus) => {
                                  if (newStatus !== order.orderStatus) {
                                      if (newStatus === 'Payment Received (COD)') {
                                          setCodPaymentOrder(order);
                                      } else if (newStatus === 'Completed' && (order.paymentType === 'Installment' || order.paymentType === 'Lay-away') && order.balanceDue > 0) {
                                          setDueDateOrder(order);
                                      } else if (newStatus === 'Shipped') {
                                          setMarkShippedOrder(order);
                                      } else {
                                          handleStatusChange(order.id, newStatus as Order['orderStatus']);
                                      }
                                  }
                                }}
                              >
                                {statuses.map((status) => (
                                  <DropdownMenuRadioItem key={status} value={status} disabled={order.orderStatus === status}>
                                    {status}
                                  </DropdownMenuRadioItem>
                                ))}
                                </DropdownMenuRadioGroup>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            {!isInventoryOnly && canEditOrder && (
                              <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                      onClick={() => handleStatusChange(order.id, 'Cancelled')}
                                      disabled={order.orderStatus === 'Cancelled' || order.orderStatus === 'Returned'}
                                  >
                                      Cancel Order
                                  </DropdownMenuItem>
                              </>
                            )}
                          </>
                        )
                      })()}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && (!formattedOrders || formattedOrders.length === 0) && (
              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                  <p className="text-lg font-semibold">No orders found</p>
                  <p className="text-muted-foreground mt-2">
                      {canCreateOrder ? 'Click "New Order" to get started.' : 'No orders matched your criteria.'}
                  </p>
              </div>
          )}
        </CardContent>
         {formattedOrders && formattedOrders.length > 0 && (
          <CardFooter>
              <div className="text-xs text-muted-foreground">
              Showing <strong>1-{formattedOrders.length}</strong> of <strong>{formattedOrders.length}</strong> orders
              </div>
          </CardFooter>
        )}
      </Card>
      {logPaymentOrder && (
        <LogPaymentDialog 
            order={logPaymentOrder}
            open={!!logPaymentOrder}
            onOpenChange={(isOpen) => !isOpen && setLogPaymentOrder(null)}
        />
      )}
      <CompleteCodPaymentDialog 
        order={codPaymentOrder} 
        open={!!codPaymentOrder} 
        onOpenChange={(open) => !open && setCodPaymentOrder(null)} 
        onSuccess={() => { refetch(); setCodPaymentOrder(null); }}
      />
      <EditPaymentTermsDialog
        order={editPaymentOrder}
        open={!!editPaymentOrder}
        onOpenChange={(open) => !open && setEditPaymentOrder(null)}
        onSuccess={() => { refetch(); setEditPaymentOrder(null); }}
      />
      {dueDateOrder && (
        <SetDueDateDialog
            open={!!dueDateOrder}
            onOpenChange={(open) => !open && setDueDateOrder(null)}
            orderId={dueDateOrder.id}
            onSuccess={() => { refetch(); setDueDateOrder(null); }}
        />
      )}
      {markShippedOrder && (
        <MarkShippedDialog
            open={!!markShippedOrder}
            onOpenChange={(isOpen) => {
                if (!isOpen) setMarkShippedOrder(null);
            }}
            orderId={markShippedOrder.id}
            currentTrackingNumber={markShippedOrder.tracking_number || ''}
            onSuccess={() => {
                refetch();
                setMarkShippedOrder(null);
            }}
        />
      )}
    </>
  );
}
