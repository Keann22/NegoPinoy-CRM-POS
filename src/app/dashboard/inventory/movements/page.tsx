'use client';

import { useMemo, useState } from 'react';
import { useCollection, useUser, useSupabase, collection, query, orderBy, where, limit } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { Calendar as CalendarIcon, Edit2, History, FilterX } from 'lucide-react';
import { EditMovementDialog } from '@/components/dashboard/inventory/edit-movement-dialog';
import { MovementHistoryDialog } from '@/components/dashboard/inventory/movement-history-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

type InventoryMovement = {
  id: string;
  product_id: string;
  quantity_change: number;
  movement_type: string;
  timestamp: string;
  reason: string;
  supplier_name: string | null;
  unit_cost: number | null;
};

type Product = {
  id: string;
  name: string;
  sku: string;
};

export default function InventoryHistoryPage() {
  const supabase = useSupabase();

  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'custom' | 'all'>('today');
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<InventoryMovement | null>(null);

  const movementsQuery = useMemo(() => {
    let constraints: any[] = [
      where('movement_type', '!=', 'sale'),
      orderBy('timestamp', 'desc'),
    ];

    let fromTime: Date | undefined;
    let toTime: Date | undefined;

    if (dateFilter === 'today') {
        const d = new Date();
        fromTime = startOfDay(d);
        toTime = endOfDay(d);
    } else if (dateFilter === 'yesterday') {
        const d = subDays(new Date(), 1);
        fromTime = startOfDay(d);
        toTime = endOfDay(d);
    } else if (dateFilter === 'custom' && date?.from) {
        fromTime = startOfDay(date.from);
        toTime = date.to ? endOfDay(date.to) : endOfDay(date.from);
    }

    if (fromTime) {
        constraints.push(where('timestamp', '>=', fromTime.toISOString()));
    }
    if (toTime) {
        constraints.push(where('timestamp', '<=', toTime.toISOString()));
    }
    
    constraints.push(limit(500));

    return query('inventory_movements', ...constraints);
  }, [dateFilter, date]);
  
  const productsQuery = { path: 'products' };

  const { data: movements, isLoading: isLoadingMovements } = useCollection<InventoryMovement>(movementsQuery);
  const { data: products, isLoading: isLoadingProducts } = useCollection<Product>(productsQuery);

  const productMap = useMemo(() => {
    if (!products) return new Map<string, string>();
    return new Map(products.map(p => [p.id, p.name]));
  }, [products]);

  const isLoading = isLoadingMovements || isLoadingProducts;

  const handleEdit = (movement: InventoryMovement) => {
    setSelectedMovement(movement);
    setEditDialogOpen(true);
  };

  const handleHistory = (movement: InventoryMovement) => {
    setSelectedMovement(movement);
    setHistoryDialogOpen(true);
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Inventory History</CardTitle>
        <CardDescription>
          A log of all recent inventory additions, adjustments, and transactions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-4 mb-6">
            <Select value={dateFilter} onValueChange={(val: any) => setDateFilter(val)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="custom">Date Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>

            {dateFilter === 'custom' && (
                <Popover>
                    <PopoverTrigger asChild>
                    <Button variant={"outline"} className={cn("w-[240px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (date.to ? <>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</> : format(date.from, "LLL dd, y")) : <span>Pick a date range</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                    <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
                    </PopoverContent>
                </Popover>
            )}

            {(dateFilter !== 'today') && (
              <Button variant="ghost" onClick={() => { setDateFilter('today'); setDate(undefined); }} className="text-muted-foreground hover:text-foreground">
                <FilterX className="mr-2 h-4 w-4" /> Reset to Today
              </Button>
            )}
        </div>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : movements && movements.length > 0 ? (
                movements.map((movement, i) => {
                  const isPositive = movement.quantity_change > 0;
                  return (
                    <TableRow key={movement.id || i}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(movement.timestamp), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {productMap.get(movement.product_id) || 'Unknown Product'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{movement.movement_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isPositive ? 'default' : 'destructive'} className={isPositive ? 'bg-green-600 hover:bg-green-700' : ''}>
                          {isPositive ? '+' : ''}{movement.quantity_change}
                        </Badge>
                      </TableCell>
                      <TableCell>{movement.supplier_name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{movement.reason || '-'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => handleHistory(movement)} title="View Edit History">
                          <History className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(movement)} title="Edit Transaction">
                          <Edit2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No inventory history found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <EditMovementDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        movement={selectedMovement as any}
        onSuccess={() => {
            // Because we're using a realtime subscription via useCollection, 
            // the table will automatically update when Supabase broadcast the change.
        }}
    />

    <MovementHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        movementId={selectedMovement?.id || null}
    />
    </>
  );
}
