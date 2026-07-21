import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAPIOutput() {
  const res = await fetch('http://localhost:3000/api/inventory/procurement');
  if (!res.ok) {
     console.error("Failed to fetch", res.status);
     return;
  }
  const data = await res.json();
  const cyp3s = [];
  
  if (data.groupedOutofStock) {
    for (const group of data.groupedOutofStock) {
      for (const item of group.items) {
        if (item.productName.toLowerCase().includes('cyp3 mixing bowl') && item.productName.toLowerCase().includes('takip')) {
          cyp3s.push(item);
        }
      }
    }
  }
  
  console.log("OUT OF STOCK ITEMS:");
  console.log(JSON.stringify(cyp3s, null, 2));
}

checkAPIOutput();
