'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isValid } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { MoreHorizontal, Eye, FileUp, FileSearch, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerifyStatementDialog } from '@/components/dashboard/accounting/verify-statement-dialog';
import { PaymentHistoryTable } from '@/components/dashboard/accounting/payment-history-table';

type Payment = {
  id: string;
  order_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes?: string;
  reference_number?: string;
  proof_url?: string;
  ocr_amount?: number;
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
  const [activeTab, setActiveTab] = useState('Pending');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Map of order_id to order & customer info
  const [orderMap, setOrderMap] = useState<Map<string, { customerName: string; salesPersonName: string }>>(new Map());
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const filteredPayments = useMemo(() => {
    return payments.filter(p => (p.status || 'Pending') === activeTab);
  }, [payments, activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredPayments.slice(start, start + itemsPerPage);
  }, [filteredPayments, currentPage, itemsPerPage]);

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

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyFile) return;

    setIsVerifying(true);
    try {
      const formData = new FormData();
      formData.append('file', verifyFile);
      if (verifyPassword) formData.append('password', verifyPassword);

      const res = await fetch('/api/payments/verify-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify');
      }

      toast({
        title: "Verification Complete",
        description: `Successfully verified ${data.verifiedCount} payments!`,
      });
      
      setIsVerifyDialogOpen(false);
      setVerifyFile(null);
      setVerifyPassword('');
      fetchPayments();
      
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Verification Failed",
        description: error.message,
      });
    } finally {
      setIsVerifying(false);
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="Pending">Pending</TabsTrigger>
                <TabsTrigger value="Verified">Verified</TabsTrigger>
                <TabsTrigger value="Rejected">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>

            <VerifyStatementDialog
              isOpen={isVerifyDialogOpen}
              onOpenChange={setIsVerifyDialogOpen}
              verifyFile={verifyFile}
              setVerifyFile={setVerifyFile}
              verifyPassword={verifyPassword}
              setVerifyPassword={setVerifyPassword}
              isVerifying={isVerifying}
              onSubmit={handleVerifySubmit}
            />
          </div>
          <PaymentHistoryTable 
            isLoading={isLoading} 
            paginatedData={paginatedData} 
            orderMap={orderMap} 
            handleStatusChange={handleStatusChange} 
          />
          {!isLoading && filteredPayments.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                  <p className="text-lg font-semibold">No payments found</p>
                  <p className="text-muted-foreground mt-2">
                      When payments are logged, they will appear here.
                  </p>
              </div>
          )}
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing <strong>{filteredPayments.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredPayments.length)}</strong> of <strong>{filteredPayments.length}</strong> payments
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || isLoading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || isLoading || filteredPayments.length === 0}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
