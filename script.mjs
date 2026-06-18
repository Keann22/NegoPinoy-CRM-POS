import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('orders')
        .select('id, spx_sync_data, tracking_number, boxes_config')
        .like('tracking_number', '%SPEPH063917236286%')
        .limit(1)
        .single();
    
    if (error) {
        console.error("Error:", error);
        return;
    }
    
    console.log(JSON.stringify(data, null, 2));
}

check();
