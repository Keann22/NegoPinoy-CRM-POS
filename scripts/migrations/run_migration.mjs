import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function mergeDuplicates() {
  console.log("Starting full merge process...");
  
  const { data: products, error } = await supabase.from('products').select('*');
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }
  
  const nameGroups = {};
  products.forEach(p => {
    if (p.name) {
      if (!nameGroups[p.name]) nameGroups[p.name] = [];
      nameGroups[p.name].push(p);
    }
  });
  
  const duplicates = Object.values(nameGroups).filter(group => group.length > 1);
  console.log(`Found ${duplicates.length} groups of exact-name duplicates to merge.`);
  
  let deletedCount = 0;
  let updatedOrdersCount = 0;
  
  for (const group of duplicates) {
    console.log(`\n========================================`);
    console.log(`Processing group: ${group[0].name}`);
    
    // Sort so that the one with highest stock_level comes first
    group.sort((a, b) => (b.stock_level || 0) - (a.stock_level || 0));
    
    // Primary product is the one with highest stock level
    const primary = group[0];
    const duplicatesToRemove = group.slice(1);
    
    console.log(`Primary Product ID selected: ${primary.id} (Current Stock: ${primary.stock_level || 0})`);
    
    // 1. Sum up total stock
    const totalStock = group.reduce((sum, p) => sum + (p.stock_level || 0), 0);
    if (totalStock !== primary.stock_level) {
      console.log(`-> Updating primary stock level to ${totalStock}...`);
      const { error: stockErr } = await supabase.from('products').update({ stock_level: totalStock }).eq('id', primary.id);
      if (stockErr) console.error('   Error updating stock:', stockErr.message);
    }
    
    // Process each duplicate
    for (const dup of duplicatesToRemove) {
      console.log(`-> Merging duplicate: ${dup.id} (Stock: ${dup.stock_level || 0})`);
      
      // 2. Reassign parent_id for any variants pointing to this duplicate
      const { data: variants } = await supabase.from('products').select('id').eq('parent_id', dup.id);
      if (variants && variants.length > 0) {
        console.log(`   Reassigning ${variants.length} variant(s) to primary product...`);
        await supabase.from('products').update({ parent_id: primary.id }).eq('parent_id', dup.id);
      }
      
      // 3. Reassign order_items
      const { data: orders } = await supabase.from('order_items').select('id').eq('product_id', dup.id);
      if (orders && orders.length > 0) {
        console.log(`   Reassigning ${orders.length} order_item(s) to primary product...`);
        await supabase.from('order_items').update({ product_id: primary.id }).eq('product_id', dup.id);
        updatedOrdersCount += orders.length;
      }
      
      // 4. Reassign purchase_order_items
      const { data: pos } = await supabase.from('purchase_order_items').select('id').eq('product_id', dup.id);
      if (pos && pos.length > 0) {
        console.log(`   Reassigning ${pos.length} purchase_order_item(s) to primary product...`);
        await supabase.from('purchase_order_items').update({ product_id: primary.id }).eq('product_id', dup.id);
      }
      
      // 5. Delete the duplicate product
      console.log(`   Deleting duplicate product ${dup.id}...`);
      const { error: delErr } = await supabase.from('products').delete().eq('id', dup.id);
      if (delErr) {
        console.error('   Failed to delete duplicate:', delErr.message, delErr.details);
      } else {
        console.log('   Successfully deleted.');
        deletedCount++;
      }
    }
  }
  
  console.log(`\n========================================`);
  console.log(`Migration Complete!`);
  console.log(`Total duplicate products deleted: ${deletedCount}`);
  console.log(`Total past order items redirected: ${updatedOrdersCount}`);
}

mergeDuplicates();
