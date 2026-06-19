import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function mergeDuplicates() {
  console.log("Starting merge process...");
  
  const { data: products, error } = await supabase.from('products').select('*');
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }
  
  // Group by exact name
  const nameGroups = {};
  products.forEach(p => {
    if (p.name) {
      if (!nameGroups[p.name]) nameGroups[p.name] = [];
      nameGroups[p.name].push(p);
    }
  });
  
  const duplicates = Object.values(nameGroups).filter(group => group.length > 1);
  console.log(`Found ${duplicates.length} duplicate groups.`);
  
  // Try to process just ONE group first to see if foreign key errors occur
  if (duplicates.length > 0) {
    const group = duplicates[0];
    console.log(`\nProcessing group: ${group[0].name}`);
    
    // Pick primary: highest stock_level
    group.sort((a, b) => (b.stock_level || 0) - (a.stock_level || 0));
    const primary = group[0];
    const others = group.slice(1);
    
    console.log(`Primary ID: ${primary.id} (Stock: ${primary.stock_level})`);
    console.log(`Duplicates to merge/delete: ${others.map(o => o.id).join(', ')}`);
    
    // Sum stock
    const totalStock = group.reduce((sum, p) => sum + (p.stock_level || 0), 0);
    
    if (totalStock !== primary.stock_level) {
      console.log(`Updating primary stock level to ${totalStock}...`);
      const { error: updateErr } = await supabase.from('products').update({ stock_level: totalStock }).eq('id', primary.id);
      if (updateErr) console.error('Error updating stock:', updateErr.message);
    }
    
    // Attempt to delete one duplicate to see if it fails due to FK
    const dupToDelete = others[0];
    console.log(`Attempting to delete duplicate ID: ${dupToDelete.id}`);
    
    const { error: deleteErr } = await supabase.from('products').delete().eq('id', dupToDelete.id);
    
    if (deleteErr) {
      console.error('Delete failed (likely FK constraint):', deleteErr.message);
      console.error('Error details:', deleteErr.details);
    } else {
      console.log('Delete succeeded! No blocking foreign key constraints.');
    }
  }
}

mergeDuplicates();
