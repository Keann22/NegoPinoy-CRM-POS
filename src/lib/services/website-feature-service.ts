import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Puts one product at the top of the customer website ("Napili ngayong linggo").
 * Only one product is featured at a time, so the previous one is cleared first.
 * Pass the product row (not a size row). Needs migration 2026-11-03_products_is_featured.sql.
 */
export async function featureOnWebsite(supabase: SupabaseClient, productId: string): Promise<void> {
  const { error: clearError } = await supabase.from('products').update({ is_featured: false }).eq('is_featured', true);
  if (clearError) throw clearError;
  const { error } = await supabase.from('products').update({ is_featured: true }).eq('id', productId);
  if (error) throw error;
}
