'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Loader2, PhilippinePeso, Pencil, Check, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { AddSupplierDialog } from '@/components/dashboard/add-supplier-dialog';
import { usePendingCosts } from '@/hooks/usePendingCosts';

export default function PendingCostsPage() {
  const {
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
  } = usePendingCosts();

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
          Stock that was received before anyone knew its price. Encoding the supplier and unit cost here fixes the
          inventory ledger, backfills COGS onto anything already sold from it, and makes the purchase appear in the
          Purchases Report.
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
                {selectedProduct.images.filter((img: string) => !img.includes('placehold.co')).map((img: string, i: number) => (
                    <div key={i} className="relative w-24 h-24 shrink-0 rounded-md overflow-hidden border">
                        <ZoomableImage src={img} alt={`${selectedProduct.name} ${i+1}`} fill className="object-cover" />
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
