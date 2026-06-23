import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Starting one-time inventory cleanup...');

  // 1. Get all pending POs
  const { data: pos, error: poErr } = await supabase
    .from('purchase_orders')
    .select(`
      id, 
      notes,
      purchase_order_items (
        product_id,
        expected_qty
      )
    `)
    .eq('status', 'pending_receipt');

  if (poErr) throw poErr;

  const itemMap = new Map<string, number>(); // productId -> total expected qty

  for (const po of pos) {
    for (const item of po.purchase_order_items) {
      const current = itemMap.get(item.product_id) || 0;
      itemMap.set(item.product_id, current + item.expected_qty);
    }
  }

  // 2. Get all products with negative inventory
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, stock_level')
    .lt('stock_level', 0);

  if (prodErr) throw prodErr;

  let fixedCount = 0;

  for (const product of products) {
    const expectedQty = itemMap.get(product.id);
    
    if (expectedQty !== undefined) {
      // The goal is for the stock_level to be exactly -expectedQty
      // So when the PO is received, stock_level becomes 0
      const targetStockLevel = -expectedQty;
      const currentStockLevel = product.stock_level;
      
      const discrepancy = targetStockLevel - currentStockLevel;
      
      if (discrepancy !== 0) {
        console.log(`Fixing ${product.name}: Current=${currentStockLevel}, Requested=${expectedQty}. Adjusting by ${discrepancy} to reach ${targetStockLevel}`);
        
        // Update product stock level
        const { error: updateErr } = await supabase
          .from('products')
          .update({ stock_level: targetStockLevel })
          .eq('id', product.id);
          
        if (updateErr) {
          console.error(`Failed to update ${product.name}:`, updateErr);
          continue;
        }

        // Insert transaction record for Option C audit
        const { error: txErr } = await supabase
          .from('inventory_transactions')
          .insert({
            product_id: product.id,
            quantity: discrepancy,
            type: 'adjustment',
            reason: 'Option C Discrepancy Cleanup (One-Time)',
            previous_stock: currentStockLevel,
            new_stock: targetStockLevel,
            user_id: null // System script
          });
          
        if (txErr) {
          console.error(`Failed to log transaction for ${product.name}:`, txErr);
        }
        
        fixedCount++;
      }
    }
  }

  console.log(`Cleanup complete. Fixed ${fixedCount} products.`);
}

main().catch(console.error);
