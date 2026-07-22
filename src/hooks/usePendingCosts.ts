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
      // The whole repair runs server-side in one place: ledger row, product
      // cost, COGS on already-sold lines, and linking the buy into the
      // Purchases Report. Doing it here piecemeal is what previously let the
      // cost land in an expenses row that the P&L never reads.
      const supplierObj = allSuppliers.find(s => s.name === supplierValue);

      const res = await fetch('/api/inventory/pending-costs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movementId: movement.id,
          unitCost: costValue,
          supplierId: supplierObj?.id || null,
          quantity: newQuantity,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Save failed');

      const parts = [`₱${costValue.toLocaleString('en-PH')} × ${newQuantity} recorded.`];
      if (result.linesUpdated > 0) {
        parts.push(`COGS backfilled onto ${result.linesUpdated} sold order line${result.linesUpdated === 1 ? '' : 's'} (₱${Number(result.cogsAdded).toLocaleString('en-PH')}).`);
      }
      if (result.linkedPurchase) {
        parts.push('Now shows in the Purchases Report.');
      }
      toast({ title: 'Cost Saved', description: parts.join(' ') });

      setMovements(prev => prev.filter(m => m.id !== movement.id));
    } catch (error: any) {
      console.error("Error saving cost:", error);
      toast({ variant: 'destructive', title: 'Save Failed', description: error.message || 'Could not save the cost.' });
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
