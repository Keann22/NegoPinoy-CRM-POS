import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFKs() {
  const dupToDelete = '2b3b1ac1-3f6c-4b7d-b10c-53bed968219b';
  const primaryId = '25a20e57-5444-497c-bbef-c7b8451f1645';
  
  // Update children
  console.log('Reassigning children...');
  await supabase.from('products').update({ parent_id: primaryId }).eq('parent_id', dupToDelete);
  
  // Try delete again
  console.log('Attempting delete again...');
  const { error: deleteErr } = await supabase.from('products').delete().eq('id', dupToDelete);
  if (deleteErr) {
    console.error('Delete failed:', deleteErr.message, deleteErr.details);
  } else {
    console.log('Delete succeeded!');
  }
}

checkFKs();
