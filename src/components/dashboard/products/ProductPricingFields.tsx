'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSupabase } from '@/lib/supabase/hooks';
import { hasSaleDiscount } from '@/lib/pricing';

/** Price columns on `products` that are tracked in the price history. */
export const PRICE_FIELD_LABELS: Record<string, string> = {
  selling_price: 'Cash price',
  installment_price: 'Installment price',
  ads_price: 'Ads price',
  live_price: 'Live price',
  sale_price: 'Sale price',
  is_on_sale: 'On sale',
};

const optionalNumberProps = (field: any) => ({
  ...field,
  value: field.value ?? '',
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value)),
});

/**
 * ProductPricingFields
 * The product's price list: cash, installment, ads, live, and the sale switch.
 * Renders grid children — place it inside a `grid grid-cols-2` container.
 * `locked` makes every price read-only (staff who are not price managers).
 */
export function ProductPricingFields({ form, locked }: { form: any; locked: boolean }) {
  return (
    <>
      {locked && (
        <p className="col-span-2 text-xs text-amber-600 dark:text-amber-500">Only an Admin or a price manager can change prices.</p>
      )}
      <FormField control={form.control} name="sellingPrice" render={({ field }) => (
        <FormItem><FormLabel>Cash Price (₱)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="49.99" {...field} disabled={locked} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="installmentPrice" render={({ field }) => (
        <FormItem>
          <FormLabel>Installment Price (₱) <span className="text-muted-foreground text-xs font-normal">First-timers only</span></FormLabel>
          <FormControl><Input type="number" step="0.01" placeholder="Leave blank if not eligible" {...optionalNumberProps(field)} disabled={locked} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="adsPrice" render={({ field }) => (
        <FormItem>
          <FormLabel>Ads Price (₱) <span className="text-muted-foreground text-xs font-normal">Customers from an ad</span></FormLabel>
          <FormControl><Input type="number" step="0.01" placeholder="Blank = same as cash/sale price" {...optionalNumberProps(field)} disabled={locked} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="livePrice" render={({ field }) => (
        <FormItem>
          <FormLabel>Live Price (₱) <span className="text-muted-foreground text-xs font-normal">Facebook Live</span></FormLabel>
          <FormControl><Input type="number" step="0.01" placeholder="Blank = same as cash/sale price" {...optionalNumberProps(field)} disabled={locked} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="isOnSale" render={({ field }) => (
        <FormItem className="col-span-2 flex flex-row items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5 pr-4">
            <FormLabel className="text-sm">On Sale</FormLabel>
            <p className="text-xs text-muted-foreground">Shows a SALE badge. Add a lower price below for a real discount, or leave it blank for a same-price sale (e.g. Facebook Live).</p>
          </div>
          <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={locked} /></FormControl>
        </FormItem>
      )} />
      {form.watch('isOnSale') && (
        <FormField control={form.control} name="salePrice" render={({ field }) => {
          const regular = Number(form.watch('sellingPrice')) || 0;
          const sale = field.value;
          const discounted = hasSaleDiscount(regular, sale);
          const hasValue = sale !== undefined && sale !== null && Number(sale) > 0;
          return (
            <FormItem className="col-span-2">
              <FormLabel>Sale Price (₱) <span className="text-muted-foreground text-xs font-normal">Optional — lower cash price while on sale</span></FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="Leave blank for a same-price sale" {...optionalNumberProps(field)} disabled={locked} /></FormControl>
              {discounted && <p className="text-xs font-medium text-green-600 dark:text-green-500">Discounted: ₱{Number(sale).toFixed(2)} (was ₱{regular.toFixed(2)})</p>}
              {hasValue && !discounted && <p className="text-xs text-amber-600 dark:text-amber-500">Not below the cash price — the SALE badge will show at the regular price.</p>}
              {!hasValue && <p className="text-xs text-muted-foreground">Same-price sale — SALE badge only, no discount.</p>}
              <FormMessage />
            </FormItem>
          );
        }} />
      )}
    </>
  );
}

type PriceChangeLog = {
  id: string;
  user_email: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  created_at: string;
};

const formatPriceValue = (key: string, value: any) => {
  if (key === 'is_on_sale') return value ? 'Yes' : 'No';
  return value == null ? 'blank' : `₱${Number(value).toFixed(2)}`;
};

/** Who changed this product's prices, and when — read from `audit_logs`. Renders nothing when there is no history. */
export function ProductPriceHistory({ productId }: { productId: string }) {
  const supabase = useSupabase();
  const [logs, setLogs] = useState<PriceChangeLog[]>([]);

  useEffect(() => {
    if (!supabase || !productId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, user_email, old_values, new_values, created_at')
        .eq('table_name', 'products')
        .eq('record_id', productId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) console.error('Failed to fetch price history', error);
      if (!cancelled) setLogs(data || []);
    })();
    return () => { cancelled = true; };
  }, [supabase, productId]);

  if (logs.length === 0) return null;

  return (
    <details className="col-span-2 rounded-lg border p-3 text-xs">
      <summary className="cursor-pointer font-medium">Price history ({logs.length})</summary>
      <ul className="mt-2 space-y-2">
        {logs.map(log => (
          <li key={log.id}>
            <p className="text-muted-foreground">{format(new Date(log.created_at), 'MMM d, yyyy h:mm a')} — {log.user_email || 'Unknown'}</p>
            {Object.keys(log.new_values || {}).map(key => (
              <p key={key}>
                {PRICE_FIELD_LABELS[key] || key}: {formatPriceValue(key, log.old_values?.[key])} → {formatPriceValue(key, log.new_values?.[key])}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}
