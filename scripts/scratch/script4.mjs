import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('orders')
        .select('id, total_amount, amount_paid, payment_method, balance_due, shipping_address, boxes_config, spx_sync_data, package_length, package_width, package_height, package_weight')
        .order('created_at', { ascending: false })
        .limit(1000);
    
    if (error) {
        console.error("Error:", error);
        return;
    }
    
    const target = data.find(o => o.id.toUpperCase().startsWith('75D497A3'));
    console.log(JSON.stringify(target || "Not found", null, 2));
}

check();
