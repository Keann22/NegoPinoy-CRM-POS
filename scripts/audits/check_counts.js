const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envConfig = dotenv.parse(envContent);
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    const { count: expCount } = await supabase.from('expenses').select('*', { count: 'exact', head: true });
    console.log('Expenses Count:', expCount);
    
    const { count: payCount } = await supabase.from('payments').select('*', { count: 'exact', head: true });
    console.log('Payments Count:', payCount);
}

checkTables();
