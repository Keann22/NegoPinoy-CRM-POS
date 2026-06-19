'use client';

import { useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2, PhilippinePeso, Pencil, Check, Trash2 } from 'lucide-react';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { AddSupplierDialog } from '@/components/dashboard/add-supplier-dialog';

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
    supplier_pricing?: any[];
    initial_unit_cost?: number;
  };
};

export default function PendingCostsPage() {
  const [movements, setMovements] = useState<PendingMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<PendingMovement['products'] | null>(null);
  const [allSuppliers, setAllSuppliers] = useState<{id: string, name: string}[]>([]);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [addingSupplierFor, setAddingSupplierFor] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
            products!inner(name, description, images, supplier_pricing, initial_unit_cost)
          `)
          .eq('unit_cost', 0)
          .ilike('movement_type', 'restock')
          .order('timestamp', { ascending: false });

        if (error) throw error;
        
        const { data: supplierData } = await supabase
          .from('suppliers')
          .select('id, name')
          .order('name');
        
        if (supplierData) {
          setAllSuppliers(supplierData);
        }
        
        setMovements(data as unknown as PendingMovement[]);
        
        // Initialize state
        const initialCosts: Record<string, string> = {};
        const initialSuppliers: Record<string, string> = {};
        const initialQuantities: Record<string, number> = {};
        data?.forEach((m: any) => {
          let pastCost = m.products.initial_unit_cost || '';
          let pastSupplier = '';
          if (m.products.supplier_pricing && m.products.supplier_pricing.length > 0) {
              pastSupplier = m.products.supplier_pricing[0].supplierName || '';
              if (!pastCost) pastCost = m.products.supplier_pricing[0].unitCost || '';
          }
          
          initialCosts[m.id] = pastCost ? pastCost.toString() : '';
          initialSuppliers[m.id] = m.supplier_name || pastSupplier;
          initialQuantities[m.id] = m.quantity_change;
        });
        setCosts(initialCosts);
        setSuppliers(initialSuppliers);
        setQuantities(initialQuantities);
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
    const newQuantity = quantities[movement.id] !== undefined ? quantities[movement.id] : movement.quantity_change;

    if (isNaN(costValue) || costValue <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Cost', description: 'Please enter a valid unit cost greater than 0.' });
      return;
    }

    if (isNaN(newQuantity) || newQuantity <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Quantity', description: 'Please enter a valid quantity greater than 0.' });
      return;
    }

    setSavingId(movement.id);
    try {
      const qtyDifference = newQuantity - movement.quantity_change;

      // 1. Update the inventory movement
      const { error: moveError } = await supabase
        .from('inventory_movements')
        .update({ 
            unit_cost: costValue,
            supplier_name: supplierValue || null,
            quantity_change: newQuantity
        })
        .eq('id', movement.id);
      
      if (moveError) throw moveError;

      // Update product stock if quantity changed using atomic RPC
      if (qtyDifference !== 0) {
        const { error: updateErr } = await supabase.rpc('increment_stock', { p_product_id: movement.product_id, qty: qtyDifference });
        if (updateErr) throw updateErr;
      }

      // 2. Update the product's initial_unit_cost and supplier_pricing
      let updatedSupplierPricing = movement.products.supplier_pricing || [];
      const supplierObj = allSuppliers.find(s => s.name === supplierValue);
      
      if (supplierObj) {
         const existingIndex = updatedSupplierPricing.findIndex((sp: any) => sp.supplierId === supplierObj.id);
         if (existingIndex >= 0) {
             updatedSupplierPricing[existingIndex].unitCost = costValue;
         } else {
             updatedSupplierPricing.push({
                 supplierId: supplierObj.id,
                 supplierName: supplierObj.name,
                 unitCost: costValue
             });
         }
      }

      const { error: prodError } = await supabase
        .from('products')
        .update({ 
            initial_unit_cost: costValue,
            supplier_pricing: updatedSupplierPricing 
        })
        .eq('id', movement.product_id);

      if (prodError) throw prodError;

      // 3. Record the expense
      const { error: expError } = await supabase
        .from('expenses')
        .insert({
          expense_date: movement.timestamp,
          amount: costValue * newQuantity,
          category: 'Cost of Goods Sold',
          description: `[${movement.products.name}] ${movement.reason} (Cost Encoded Later)`
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

  const handleDelete = async (movement: PendingMovement) => {
    if (!window.confirm(`Are you sure you want to delete this pending receive for ${movement.products.name}? This will also subtract ${movement.quantity_change} from the inventory.`)) {
        return;
    }

    setDeletingId(movement.id);
    try {
        const { error: updateErr } = await supabase.rpc('increment_stock', { p_product_id: movement.product_id, qty: -movement.quantity_change });
        if (updateErr) throw updateErr;

        const { error: delErr } = await supabase.from('inventory_movements').delete().eq('id', movement.id);
        if (delErr) throw delErr;

        toast({ title: 'Deleted', description: 'The pending receipt has been deleted and inventory adjusted.' });
        setMovements(prev => prev.filter(m => m.id !== movement.id));
    } catch (error) {
        console.error("Error deleting pending cost:", error);
        toast({ variant: 'destructive', title: 'Delete Failed', description: 'Could not delete the pending receipt.' });
    } finally {
        setDeletingId(null);
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
                        className="text-primary hover:underline text-left transition-colors flex flex-col"
                      >
                        <span>{m.products.name}</span>
                        {(() => {
                            const selectedSupplier = suppliers[m.id] || m.supplier_name;
                            const pricing = m.products.supplier_pricing || [];
                            const sp = pricing.find((s: any) => s.supplierName === selectedSupplier) || pricing.find((s: any) => s.supplierCode);
                            return sp?.supplierCode ? (
                                <span className="text-xs text-muted-foreground font-mono mt-0.5" title="Supplier Code">
                                    {sp.supplierCode}
                                </span>
                            ) : null;
                        })()}
                      </button>
                    </TableCell>
                    <TableCell>
                      {editingQtyId === m.id ? (
                        <div className="flex items-center gap-1">
                          <Input 
                            type="number"
                            value={quantities[m.id] !== undefined ? quantities[m.id] : m.quantity_change}
                            onChange={(e) => setQuantities({ ...quantities, [m.id]: parseInt(e.target.value) || 0 })}
                            className="h-8 w-20 text-sm"
                            autoFocus
                          />
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => setEditingQtyId(null)}>
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-h-8">
                          <span>{quantities[m.id] !== undefined ? quantities[m.id] : m.quantity_change}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setEditingQtyId(m.id)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{m.reason}</TableCell>
                    <TableCell>
                      <Select 
                        value={suppliers[m.id] || ''} 
                        onValueChange={(val) => {
                          if (val === 'ADD_NEW') {
                            setAddingSupplierFor(m.id);
                            setShowAddSupplier(true);
                          } else {
                            setSuppliers({ ...suppliers, [m.id]: val });
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm w-[180px]">
                          <SelectValue placeholder="Select supplier..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allSuppliers.map(s => (
                            <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                          ))}
                          {allSuppliers.length > 0 && <SelectSeparator />}
                          <SelectItem value="ADD_NEW" className="text-primary font-medium focus:text-primary focus:bg-primary/10 cursor-pointer">+ Add Supplier</SelectItem>
                        </SelectContent>
                      </Select>
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
                      {(m.products.initial_unit_cost ?? 0) > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-1">Last: ₱{m.products.initial_unit_cost}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(m)} 
                            disabled={deletingId === m.id || savingId === m.id}
                            title="Delete this receipt"
                          >
                            {deletingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => handleSave(m)} 
                            disabled={savingId === m.id || deletingId === m.id || !costs[m.id]}
                          >
                            {savingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                          </Button>
                      </div>
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
    <AddSupplierDialog 
        open={showAddSupplier} 
        onOpenChange={setShowAddSupplier} 
        onSuccess={(newSupplier) => {
            setAllSuppliers(prev => [...prev, newSupplier].sort((a, b) => a.name.localeCompare(b.name)));
            if (addingSupplierFor) {
                setSuppliers({ ...suppliers, [addingSupplierFor]: newSupplier.name });
            }
        }} 
    />
    </>
  );
}
