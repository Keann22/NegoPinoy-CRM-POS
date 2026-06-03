'use client';

import { useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2, PhilippinePeso } from 'lucide-react';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Image from 'next/image';

type PendingMovement = {
  id: string;
  product_id: string;
  quantity_change: number;
  timestamp: string;
  reason: string;
  supplier_name: string | null;
  products: {
    name: string;
    description?: string;
    images?: string[];
  };
};

export default function PendingCostsPage() {
  const [movements, setMovements] = useState<PendingMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<PendingMovement['products'] | null>(null);

  const supabase = useSupabase();
  const { toast } = useToast();
  const { isManagement, isLoading: isRoleLoading } = useRoleCheck();

  useEffect(() => {
    if (!supabase || isRoleLoading) return;

    const fetchPending = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('inventory_movements')
          .select(`
            id,
            product_id,
            quantity_change,
            timestamp,
            reason,
            supplier_name,
            products!inner(name, description, images)
          `)
          .eq('unit_cost', 0)
          .eq('movement_type', 'RESTOCK')
          .order('timestamp', { ascending: false });

        if (error) throw error;
        
        setMovements(data as unknown as PendingMovement[]);
        
        // Initialize state
        const initialCosts: Record<string, string> = {};
        const initialSuppliers: Record<string, string> = {};
        data?.forEach((m: any) => {
          initialCosts[m.id] = '';
          initialSuppliers[m.id] = m.supplier_name || '';
        });
        setCosts(initialCosts);
        setSuppliers(initialSuppliers);
      } catch (error) {
        console.error("Error fetching pending costs:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load pending costs.' });
      } finally {
        setIsLoading(false);
      }
    };

    if (isManagement) {
      fetchPending();
    } else {
        setIsLoading(false);
    }
  }, [supabase, isManagement, isRoleLoading]);

  const handleSave = async (movement: PendingMovement) => {
    const costValue = parseFloat(costs[movement.id]);
    const supplierValue = suppliers[movement.id];

    if (isNaN(costValue) || costValue <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Cost', description: 'Please enter a valid unit cost greater than 0.' });
      return;
    }

    setSavingId(movement.id);
    try {
      // 1. Update the inventory movement
      const { error: moveError } = await supabase
        .from('inventory_movements')
        .update({ 
            unit_cost: costValue,
            supplier_name: supplierValue || null
        })
        .eq('id', movement.id);
      
      if (moveError) throw moveError;

      // 2. Update the product's initial_unit_cost
      const { error: prodError } = await supabase
        .from('products')
        .update({ initial_unit_cost: costValue })
        .eq('id', movement.product_id);

      if (prodError) throw prodError;

      // 3. Record the expense
      const { error: expError } = await supabase
        .from('expenses')
        .insert({
          expense_date: movement.timestamp,
          amount: costValue * movement.quantity_change,
          category: 'Cost of Goods Sold',
          description: `${movement.reason} (Cost Encoded Later)`
        });

      if (expError) throw expError;

      toast({ title: 'Cost Saved', description: 'The inventory cost and expense have been successfully recorded.' });
      
      // Remove from list
      setMovements(prev => prev.filter(m => m.id !== movement.id));
    } catch (error) {
      console.error("Error saving cost:", error);
      toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save the cost.' });
    } finally {
      setSavingId(null);
    }
  };

  if (isRoleLoading || isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!isManagement) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unauthorized</CardTitle>
          <CardDescription>You do not have permission to view this page.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PhilippinePeso className="h-5 w-5" /> Encode Pending Costs</CardTitle>
        <CardDescription>
          Review inventory that was received without a supplier cost and encode the correct pricing to update your expenses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="w-[150px]">Unit Cost (₱)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                    No pending costs found. All inventory receipts have pricing!
                  </TableCell>
                </TableRow>
              ) : (
                movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(m.timestamp), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="font-medium">
                      <button 
                        onClick={() => setSelectedProduct(m.products)}
                        className="text-primary hover:underline text-left transition-colors"
                      >
                        {m.products.name}
                      </button>
                    </TableCell>
                    <TableCell>{m.quantity_change}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{m.reason}</TableCell>
                    <TableCell>
                      <Input 
                        placeholder="Supplier..." 
                        value={suppliers[m.id] || ''} 
                        onChange={(e) => setSuppliers({ ...suppliers, [m.id]: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="0.00" 
                        value={costs[m.id] || ''} 
                        onChange={(e) => setCosts({ ...costs, [m.id]: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        onClick={() => handleSave(m)} 
                        disabled={savingId === m.id || !costs[m.id]}
                      >
                        {savingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{selectedProduct?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {selectedProduct?.images && selectedProduct.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
                {selectedProduct.images.filter(img => !img.includes('placehold.co')).map((img, i) => (
                    <div key={i} className="relative w-24 h-24 shrink-0 rounded-md overflow-hidden border">
                        <Image src={img} alt={`${selectedProduct.name} ${i+1}`} fill className="object-cover" />
                    </div>
                ))}
            </div>
          )}
          <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
              <div className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-wrap text-foreground min-h-[60px]">
                  {selectedProduct?.description || <span className="text-muted-foreground italic">No description provided.</span>}
              </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
