'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSupabase, useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Loader2, PackagePlus, AlertCircle, Box } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ProductWithRecipe = {
    id: string;
    name: string;
    assembly_recipe: { productId: string; productName: string; quantity: number }[] | null;
    stock_level: number;
    initial_unit_cost?: number;
};

type ComponentDetails = {
    id: string;
    name: string;
    stock_level: number;
    initial_unit_cost?: number;
};

export default function AssembleKitPage() {
    const supabase = useSupabase();
    const { user } = useUser();
    const { toast } = useToast();

    const [productSearch, setProductSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<ProductWithRecipe | null>(null);
    const [assembleQty, setAssembleQty] = useState<string>('1');
    const [loading, setLoading] = useState(false);
    const [componentDetails, setComponentDetails] = useState<Record<string, ComponentDetails>>({});

    const [searchResults, setSearchResults] = useState<ProductWithRecipe[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (!supabase || !user || productSearch.length < 1) {
            setSearchResults([]);
            return;
        }
        const handler = setTimeout(async () => {
            setIsSearching(true);
            try {
                let query = supabase.from('products').select('*');
        const searchWords = productSearch.split(' ').filter(w => w.trim() !== '');
        searchWords.forEach(w => {
            query = query.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`);
        });
        const { data, error } = await query.order('name').limit(10);
        if (error) throw error;
                setSearchResults(data || []);
            } catch (err) {
                console.error('Assemble product search error:', err);
            } finally {
                setIsSearching(false);
            }
        }, 250);
        return () => clearTimeout(handler);
    }, [supabase, user, productSearch]);

    // Fetch component details when a product with a recipe is selected
    useEffect(() => {
        const fetchComponents = async () => {
            if (!supabase || !selectedProduct?.assembly_recipe?.length) {
                setComponentDetails({});
                return;
            }

            const componentIds = selectedProduct.assembly_recipe.map(r => r.productId);
            const { data, error } = await supabase
                .from('products')
                .select('id, name, stock_level, initial_unit_cost')
                .in('id', componentIds);

            if (error) {
                console.error("Error fetching components:", error);
                return;
            }

            const detailsMap: Record<string, ComponentDetails> = {};
            data?.forEach(d => {
                detailsMap[d.id] = d;
            });
            setComponentDetails(detailsMap);
        };

        fetchComponents();
    }, [selectedProduct, supabase]);

    const qty = parseInt(assembleQty) || 0;
    const recipe = selectedProduct?.assembly_recipe || [];
    const hasRecipe = recipe.length > 0;

    const canAssemble = useMemo(() => {
        if (!hasRecipe || qty <= 0) return false;
        
        for (const item of recipe) {
            const required = item.quantity * qty;
            const available = componentDetails[item.productId]?.stock_level || 0;
            if (available < required) return false;
        }
        return true;
    }, [recipe, qty, componentDetails, hasRecipe]);

    const handleAssemble = async () => {
        if (!supabase || !selectedProduct || !canAssemble || qty <= 0) return;
        setLoading(true);

        try {
            // Calculate new cost for the bundle
            let totalUnitCost = 0;
            const componentUpdates = [];
            const componentMovements = [];

            for (const item of recipe) {
                const comp = componentDetails[item.productId];
                const requiredQty = item.quantity * qty;
                totalUnitCost += (comp.initial_unit_cost || 0) * item.quantity;
                componentUpdates.push({
                    id: comp.id,
                    qty_change: -requiredQty
                });

                componentMovements.push({
                    product_id: comp.id,
                    quantity_change: -requiredQty,
                    movement_type: 'used_in_assembly',
                    timestamp: new Date().toISOString(),
                    reason: `Used to assemble ${qty}x ${selectedProduct.name}`,
                    unit_cost: comp.initial_unit_cost || 0
                });
            }

            // Execute component stock updates using atomic RPC
            for (const update of componentUpdates) {
                const { error } = await supabase.rpc('increment_stock', {
                    p_product_id: update.id,
                    qty: update.qty_change
                });
                if (error) throw error;
            }

            // Insert component movements
            const { error: moveErr } = await supabase.from('inventory_movements').insert(componentMovements);
            if (moveErr) throw moveErr;

            // Update Target Product using atomic RPC
            const { error: targetUpdateErr } = await supabase.rpc('increment_stock', {
                p_product_id: selectedProduct.id,
                qty: qty,
                new_unit_cost: totalUnitCost
            });
                
            if (targetUpdateErr) throw targetUpdateErr;

            // Insert Target Product movement
            const { error: targetMoveErr } = await supabase.from('inventory_movements').insert({
                product_id: selectedProduct.id,
                quantity_change: qty,
                movement_type: 'assembly',
                timestamp: new Date().toISOString(),
                reason: `Assembled from components`,
                unit_cost: totalUnitCost
            });

            if (targetMoveErr) throw targetMoveErr;

            toast({
                title: "Assembly Successful!",
                description: `Successfully assembled ${qty} units of ${selectedProduct.name}.`,
            });

            // Reset form
            setSelectedProduct(null);
            setProductSearch('');
            setAssembleQty('1');

        } catch (error: any) {
            console.error("Assembly error:", error);
            toast({
                variant: "destructive",
                title: "Assembly Failed",
                description: error.message || "An error occurred during assembly."
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-2">
                    <PackagePlus className="h-8 w-8 text-primary" />
                    Assemble Kits
                </h2>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Select Target Product</CardTitle>
                        <CardDescription>Search for the bundled product you want to assemble.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!selectedProduct ? (
                            <Command className="rounded-lg border">
                                <CommandInput 
                                    placeholder="Search for a bundle (e.g. Wok with Takip)..." 
                                    value={productSearch} 
                                    onValueChange={setProductSearch}
                                />
                                {productSearch.length > 0 && (
                                    <CommandList>
                                        {isSearching && <CommandItem disabled>Searching...</CommandItem>}
                                        {searchResults && searchResults.length > 0 && (
                                            <CommandGroup>
                                            {searchResults.map((p) => (
                                                <CommandItem
                                                    key={p.id}
                                                    value={p.name}
                                                    onSelect={() => {
                                                        setSelectedProduct(p);
                                                        setProductSearch('');
                                                    }}
                                                >
                                                    {p.name}
                                                    {p.assembly_recipe && p.assembly_recipe.length > 0 && (
                                                        <Badge variant="secondary" className="ml-auto">Has Recipe</Badge>
                                                    )}
                                                </CommandItem>
                                            ))}
                                            </CommandGroup>
                                        )}
                                        {!isSearching && (!searchResults || searchResults.length === 0) && productSearch.length > 1 && <CommandEmpty>No products found.</CommandEmpty>}
                                    </CommandList>
                                )}
                            </Command>
                        ) : (
                            <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                        <Box className="h-5 w-5 text-primary" />
                                        {selectedProduct.name}
                                    </h3>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(null)}>Change</Button>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Current Stock: <span className="font-medium text-foreground">{selectedProduct.stock_level || 0}</span>
                                </div>
                                
                                {hasRecipe ? (
                                    <div className="pt-4 space-y-2">
                                        <Label htmlFor="qty">Quantity to Assemble</Label>
                                        <Input 
                                            id="qty" 
                                            type="number" 
                                            min="1" 
                                            value={assembleQty} 
                                            onChange={e => setAssembleQty(e.target.value)} 
                                            className="w-full text-lg font-semibold"
                                        />
                                    </div>
                                ) : (
                                    <Alert variant="destructive" className="mt-4">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>No Recipe Found</AlertTitle>
                                        <AlertDescription>
                                            This product does not have an assembly recipe. Please edit the product in the Products tab and set up its "Assembly Recipe" first.
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className={!hasRecipe ? "opacity-50 pointer-events-none" : ""}>
                    <CardHeader>
                        <CardTitle>Required Components</CardTitle>
                        <CardDescription>
                            {hasRecipe ? `Parts needed to assemble ${qty || 0} units:` : 'Select a bundle to view requirements.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {hasRecipe && recipe.map((item) => {
                            const comp = componentDetails[item.productId];
                            const required = item.quantity * qty;
                            const available = comp?.stock_level || 0;
                            const isShort = available < required;

                            return (
                                <div key={item.productId} className="flex items-center justify-between p-3 border rounded-md bg-card">
                                    <div className="space-y-1">
                                        <p className="font-medium">{item.productName}</p>
                                        <p className="text-xs text-muted-foreground">Requires {item.quantity} per bundle</p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <div className="font-bold text-lg">
                                            {required} <span className="text-muted-foreground text-sm font-normal">needed</span>
                                        </div>
                                        <Badge variant={isShort ? "destructive" : "secondary"}>
                                            {available} in stock
                                        </Badge>
                                    </div>
                                </div>
                            );
                        })}

                        {hasRecipe && (
                            <div className="pt-6">
                                <Button 
                                    className="w-full" 
                                    size="lg" 
                                    disabled={loading || !canAssemble}
                                    onClick={handleAssemble}
                                >
                                    {loading ? (
                                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                    ) : (
                                        <PackagePlus className="h-5 w-5 mr-2" />
                                    )}
                                    {canAssemble ? `Assemble ${qty} Units` : 'Insufficient Component Stock'}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
