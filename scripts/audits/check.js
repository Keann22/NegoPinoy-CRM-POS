const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkExpenses() {
    const envPath = 'c:\\Users\\Keneth\\Documents\\NegoPinoy CRM POS\\.env.local';
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    let url = '';
    let key = '';
    
    envContent.split('\n').forEach(line => {
        if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
        if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
    });

    const supabase = createClient(url, key);

    const { data: expenses, error: expError } = await supabase
        .from('expenses')
        .select('description')
        .limit(10);
        
    console.log(expenses);
}

checkExpenses().catch(console.error);
