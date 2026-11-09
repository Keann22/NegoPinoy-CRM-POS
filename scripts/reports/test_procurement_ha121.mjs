import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getProcurementDashboardData } from '../src/lib/services/procurement-dashboard-service.js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Fetching Procurement Dashboard Data...');
  const data = await getProcurementDashboardData(supabase);
  
  console.log(`\nSuppliers: ${data.suppliers?.length}`);
  console.log(`Grouped Out of Stock Suppliers: ${data.groupedOutofStock?.length}`);
  console.log(`Purchased Items: ${data.purchasedItems?.length}`);

  // Let's filter items that mention ha121 or cyg or cover
  console.log('\n=== ITEMS ON PROCUREMENT SHEET RELATED TO HA121 OR CYG COVERS ===');
  let count = 0;
  (data.groupedOutofStock || []).forEach(group => {
    (group.items || []).forEach(item => {
      const name = (item.name || '').toLowerCase();
      if (name.includes('ha121') || name.includes('cyg') || name.includes('cover') || name.includes('takip')) {
        count++;
        console.log(`Supplier: ${group.supplierName || 'No Supplier'}`);
        console.log(`  * Item: "${item.name}" (SKU: ${item.sku})`);
        console.log(`    Need to Buy: ${item.needToBuy} | Physical Stock: ${item.physicalStock} | Unallocated: ${item.unallocatedStock} | Draft Qty: ${item.draftQuantity || 0}`);
        if (item.linkedOrders && item.linkedOrders.length > 0) {
          console.log(`    Linked Orders (${item.linkedOrders.length}): ${item.linkedOrders.map(lo => `#${lo.id.substring(0, 7)}`).join(', ')}`);
        }
      }
    });
  });

  if (count === 0) {
    console.log('No HA121 or CYG items currently in Out of Stock / Need to Buy.');
  }

  // Also check purchased items
  console.log('\n=== PURCHASED ITEMS (PENDING RECEIPT) RELATED TO HA121 OR CYG COVERS ===');
  let pCount = 0;
  (data.purchasedItems || []).forEach(item => {
    const name = (item.productName || item.name || '').toLowerCase();
    if (name.includes('ha121') || name.includes('cyg') || name.includes('cover')) {
      pCount++;
      console.log(`  * "${item.productName || item.name}" | Qty: ${item.expectedQty} | Supplier: ${item.supplierName || 'N/A'}`);
    }
  });
  if (pCount === 0) {
    console.log('No HA121 or CYG purchased items pending receipt.');
  }
}

run().catch(console.error);
