'use client';

import Link from 'next/link';
import { MoreHorizontal, Star, Flame, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AddCustomerDialog } from '@/components/dashboard/add-customer-dialog';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function CustomersPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const supabase = createClient();

  useEffect(() => {
    const handler = setTimeout(() => {
        setDebouncedQuery(searchQuery);
        setCurrentPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    let isMounted = true;
    const fetchCustomers = async () => {
        setIsLoading(true);
        try {
            let query = supabase.from('customers').select('*')
                .not('full_name', 'is', null).neq('full_name', '')
                .not('mobile_number', 'is', null).neq('mobile_number', '')
                .not('address_line', 'is', null).neq('address_line', '');
            
            if (debouncedQuery.trim()) {
                const searchWords = debouncedQuery.split(' ').filter(w => w.trim() !== '');
                searchWords.forEach(w => {
                    query = query.ilike('full_name', `%${w}%`);
                });
            } else {
                query = query.order('created_at', { ascending: false });
            }
            
            const { data, error } = await query;
                
            if (isMounted) {
                if (error) {
                    console.error('Error searching customers:', error);
                    setCustomers([]);
                } else {
                    // Quick map for camelCase where necessary, or just use snake_case directly 
                    // since the component below mostly uses snake_case keys anyway.
                    setCustomers(data || []);
                }
            }
        } catch (err) {
            console.error('Error:', err);
            if (isMounted) setCustomers([]);
        } finally {
            if (isMounted) setIsLoading(false);
        }
    };

    fetchCustomers();
    return () => { isMounted = false; };
  }, [debouncedQuery, supabase]);

  const paginatedData = customers ? customers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ) : [];
  const totalPages = customers ? Math.ceil(customers.length / itemsPerPage) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <CardTitle className="font-headline">Customer CRM</CardTitle>
          <CardDescription>
            Search and manage customer profiles.
          </CardDescription>
        </div>
        <div className="flex items-center space-x-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search by name..."
                    className="pl-8 w-[250px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <AddCustomerDialog onSuccess={() => setDebouncedQuery(debouncedQuery + ' ')} />
        </div>
      </CardHeader>
      
      {editingCustomer && (
        <AddCustomerDialog
          open={!!editingCustomer}
          onOpenChange={(open) => !open && setEditingCustomer(null)}
          customerToEdit={editingCustomer}
          onSuccess={() => {
            setEditingCustomer(null);
            setDebouncedQuery(debouncedQuery + ' ');
          }}
        />
      )}

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Kitchen Profile</TableHead>
              <TableHead>Spend & Engagement</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
                 <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                 </TableRow>
            ))}
            {!isLoading && paginatedData && paginatedData.map((cust) => {
              return (
              <TableRow key={cust.id}>
                <TableCell>
                  <Link href={`/dashboard/customers/${cust.id}`} className="font-medium text-primary hover:underline">
                    {cust.full_name || 'Unknown'}
                  </Link>
                  <div className="text-xs text-muted-foreground font-mono mt-1">{cust.psid}</div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                    cust.suki_tier?.toLowerCase() === 'vip' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
                    cust.suki_tier?.toLowerCase() === 'regular' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                    'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                  }`}>
                    {cust.suki_tier?.toLowerCase() === 'vip' && <Star className="w-3 h-3 mr-1" />}
                    {cust.suki_tier?.toUpperCase() || 'NEWBIE'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <div className="flex items-center text-sm">
                      <Flame className="w-4 h-4 text-orange-500 mr-2 opacity-70" />
                      <span className="text-muted-foreground">{cust.stove_type || 'Unknown Stove'}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Users className="w-4 h-4 text-blue-500 mr-2 opacity-70" />
                      <span className="text-muted-foreground text-xs">Family Size: {cust.family_size || '?'}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <div className="text-emerald-500 font-medium mb-1">₱{Number(cust.total_lifetime_spend || 0).toLocaleString()}</div>
                  {cust.pain_points && Object.keys(cust.pain_points).length > 0 && (
                    <div className="text-xs text-muted-foreground flex items-center">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full mr-1.5"></span>
                      {Object.keys(cust.pain_points).length} Pain point(s) recorded
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-haspopup="true" size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => router.push(`/dashboard/customers/${cust.id}`)}>
                        View Account
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditingCustomer(cust)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
        {!isLoading && (!customers || customers.length === 0) && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                {debouncedQuery.trim() ? (
                    <>
                        <p className="text-lg font-semibold">No customers found</p>
                        <p className="text-muted-foreground mt-2">
                            Try adjusting your search criteria.
                        </p>
                    </>
                ) : (
                    <>
                        <Users className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                        <p className="text-lg font-semibold">No customers yet</p>
                        <p className="text-muted-foreground mt-2">
                            You haven&apos;t added any customers. Click &quot;Add Customer&quot; to get started.
                        </p>
                    </>
                )}
            </div>
        )}
      </CardContent>
      {customers && customers.length > 0 && (
        <CardFooter className="flex flex-col sm:flex-row justify-between items-center py-4 gap-4 border-t">
          <div className="text-xs text-muted-foreground text-center sm:text-left">
            Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong>-<strong>{Math.min(currentPage * itemsPerPage, customers.length)}</strong> of <strong>{customers.length}</strong> results
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

