import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useRoleCheck } from '@/hooks/useRoleCheck';

export type PendingMovement = {
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

export function usePendingCosts() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const { isManagement, isLoading: isRoleLoading } = useRoleCheck();

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

      const { error: moveError } = await supabase
        .from('inventory_movements')
        .update({ 
            unit_cost: costValue,
            supplier_name: supplierValue || null,
            quantity_change: newQuantity
        })
        .eq('id', movement.id);
      
      if (moveError) throw moveError;

      if (qtyDifference !== 0) {
        const { error: updateErr } = await supabase.rpc('increment_stock', { p_product_id: movement.product_id, qty: qtyDifference });
        if (updateErr) throw updateErr;
      }

      const updatedSupplierPricing = movement.products.supplier_pricing || [];
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

  return {
    movements,
    isLoading,
    isRoleLoading,
    isManagement,
    costs,
    setCosts,
    suppliers,
    setSuppliers,
    savingId,
    selectedProduct,
    setSelectedProduct,
    allSuppliers,
    setAllSuppliers,
    showAddSupplier,
    setShowAddSupplier,
    addingSupplierFor,
    setAddingSupplierFor,
    quantities,
    setQuantities,
    editingQtyId,
    setEditingQtyId,
    deletingId,
    handleSave,
    handleDelete
  };
}
