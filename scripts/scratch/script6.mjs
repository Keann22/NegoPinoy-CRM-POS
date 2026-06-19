import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('orders')
        .select('id, total_amount, amount_paid, payment_method, balance_due, shipping_address, boxes_config, spx_sync_data, package_length, package_width, package_height, package_weight')
        .like('tracking_number', '%SPEPH066297056206%')
        .limit(1)
        .single();
    
    if (error) {
        console.error("Error:", error);
        return;
    }
    
    console.log(JSON.stringify(data, null, 2));
}

check();
