'use client';

import { useEffect, useState } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlusCircle, Printer } from 'lucide-react';

type Product = { id: string; name: string; stock_level: number; variant_name?: string; [key: string]: any; };

interface NeedsProcurementListProps {
  onAddProduct: (product: { id: string; name: string }) => void;
}

export function NeedsProcurementList({ onAddProduct }: NeedsProcurementListProps) {
  const supabase = useSupabase();
  const { user } = useUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user) return;
    const fetch = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, stock_level, variant_name')
          .lt('stock_level', 0)
          .order('stock_level', { ascending: true });
        if (error) throw error;
        setProducts(data || []);
      } catch (err) {
        console.error('NeedsProcurementList fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetch();
  }, [supabase, user]);

  return (
    <Card className="h-full flex flex-col border-destructive/20 shadow-sm printable-area">
      <CardHeader className="pb-3 bg-destructive/5 rounded-t-xl">
        <CardTitle className="text-lg font-headline flex items-center justify-between">
          <div className="flex items-center gap-2">
            To Procure List
            {products.length > 0 && (
              <Badge variant="destructive">{products.length} Items</Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.print()} title="Print List">
            <Printer className="h-4 w-4" />
          </Button>
        </CardTitle>
        <CardDescription>
          Products with negative Available stock that need to be purchased.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-32 p-6 text-center text-muted-foreground">
            <p className="font-medium text-foreground">All caught up!</p>
            <p className="text-sm">No products currently have negative stock.</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] md:h-full">
            <div className="divide-y">
              {products.map((product) => {
                const displayName = product.variant_name ? `${product.name} - ${product.variant_name}` : product.name;
                return (
                  <div key={product.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="font-medium truncate text-sm" title={displayName}>
                        {displayName}
                      </p>
                      <p className="text-sm text-destructive font-semibold mt-1">
                        Available to Sell: {product.stock_level}
                      </p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="secondary"
                      onClick={() => onAddProduct({ id: product.id, name: displayName })}
                      className="shrink-0"
                    >
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
