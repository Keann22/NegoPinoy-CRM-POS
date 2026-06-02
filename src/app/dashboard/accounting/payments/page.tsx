'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isValid } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useUserProfile } from '@/hooks/useUserProfile';
import Link from 'next/link';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Payment = {
  id: string;
  order_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes?: string;
  proof_url?: string;
  status: 'Pending' | 'Verified' | 'Rejected';
};

export default function PaymentsPage() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();

  const isManagement = useMemo(() => userProfile?.roles.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  
  // Map of order_id to order & customer info
  const [orderMap, setOrderMap] = useState<Map<string, { customerName: string; salesPersonName: string }>>(new Map());
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Fetch payments
  const fetchPayments = async () => {
    if (!supabase || !isManagement) {
      setIsLoadingPayments(false);
      return;
    }
    
    setIsLoadingPayments(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('payment_date', { ascending: false });
        
      if (error) throw error;
      const withProof = (data || []).filter(p => p.proof_url && p.proof_url.trim() !== '');
      setPayments(withProof);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load payments.",
      });
    } finally {
      setIsLoadingPayments(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [supabase, isManagement]);

  // Fetch order and customer details when payments change
  useEffect(() => {
    if (!payments || payments.length === 0 || !supabase) return;

    const fetchOrders = async () => {
      setIsLoadingOrders(true);
      try {
        const orderIds = Array.from(new Set(payments.map(p => p.order_id)));
        if (orderIds.length === 0) return;

        const map = new Map<string, { customerName: string; salesPersonName: string }>();
        
        // Supabase nested join syntax: fetching order and its related customer
        const { data, error } = await supabase
          .from('orders')
          .select('id, sales_person_name, customers(full_name)')
          .in('id', orderIds);
          
        if (error) throw error;
        
        if (data) {
          data.forEach(o => {
            // @ts-ignore - Supabase nested type casting
            const customerName = o.customers?.full_name || 'Unknown Customer';
            const salesPersonName = o.sales_person_name || 'Unknown';
            map.set(o.id, { customerName, salesPersonName });
          });
        }
        setOrderMap(map);
      } catch (err) {
        console.error('Error fetching orders for payments:', err);
      } finally {
        setIsLoadingOrders(false);
      }
    };
    
    fetchOrders();
  }, [payments, supabase]);

  const isLoading = isLoadingPayments || isLoadingOrders;

  const handleStatusChange = async (paymentId: string, newStatus: string) => {
    if (!supabase) return;
    
    try {
      const { error } = await supabase
        .from('payments')
        .update({ status: newStatus })
        .eq('id', paymentId);
        
      if (error) throw error;
      
      toast({
        title: "Status Updated",
        description: `Payment status has been updated to ${newStatus}.`,
      });
      
      // Update local state
      setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: newStatus as any } : p));
      
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update payment status.",
      });
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Verified':
        return 'default';
      case 'Rejected':
        return 'destructive';
      case 'Pending':
      default:
        return 'secondary';
    }
  };

  if (userProfile && !isManagement) {
    return (
        <Card className="m-6 border-destructive/20 bg-destructive/5">
            <CardHeader>
                <CardTitle className="text-destructive">Access Denied</CardTitle>
                <CardDescription>You do not have permission to view financial records or payments.</CardDescription>
            </CardHeader>
        </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Payments Log</CardTitle>
          <CardDescription>
            View all logged payments, verify amounts, and update their statuses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Processor</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                   <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                   </TableRow>
              ))}
              {!isLoading && payments.map((payment) => {
                const orderInfo = orderMap.get(payment.order_id);
                const d = new Date(payment.payment_date);
                const isDateValid = isValid(d);

                return (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap">
                      {isDateValid ? format(d, 'MMM d, yyyy h:mm a') : 'Unknown'}
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/orders/${payment.order_id}`} className="font-semibold text-primary hover:underline">
                        #{payment.order_id.substring(0, 7).toUpperCase()}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {orderInfo?.customerName || 'Loading...'}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {orderInfo?.salesPersonName || 'Unknown'}
                    </TableCell>
                    <TableCell>{payment.payment_method}</TableCell>
                    <TableCell>
                      {payment.proof_url ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Payment Proof</DialogTitle>
                            </DialogHeader>
                            <div className="flex items-center justify-center p-4">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img 
                                src={payment.proof_url} 
                                alt="Payment Proof" 
                                className="max-h-[70vh] object-contain rounded-md" 
                              />
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={payment.notes}>
                      {payment.notes || '-'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ₱{(Number(payment.amount) || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(payment.status || 'Pending')}>
                        {payment.status || 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuRadioGroup 
                            value={payment.status || 'Pending'}
                            onValueChange={(val) => handleStatusChange(payment.id, val)}
                          >
                            <DropdownMenuRadioItem value="Pending">Pending</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="Verified">Verified</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="Rejected">Rejected</DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!isLoading && payments.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                  <p className="text-lg font-semibold">No payments found</p>
                  <p className="text-muted-foreground mt-2">
                      When payments are logged, they will appear here.
                  </p>
              </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
