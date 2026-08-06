import { createClient } from '@supabase/supabase-js';
import { getProcurementDashboardData } from '../../src/lib/services/procurement-dashboard-service';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  try {
    const data = await getProcurementDashboardData(supabase);
    console.log("Groups:", data.groupedOutofStock.length);
    let totalItems = 0;
    data.groupedOutofStock.forEach((g: any) => totalItems += g.items.length);
    console.log("Total items:", totalItems);
  } catch (err: any) {
    console.error("Dashboard Error:", err.message);
  }
}

main().catch(console.error);
