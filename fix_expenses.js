const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function fixExpenses() {
    // We need the supabase URL and anon key from .env.local
    const envPath = 'c:\\Users\\Keneth\\Documents\\NegoPinoy CRM POS\\.env.local';
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    let url = '';
    let key = '';
    
    envContent.split('\n').forEach(line => {
        if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
        if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
    });

    const supabase = createClient(url, key);

    console.log("Fetching expenses...");
    const { data: expenses, error: expError } = await supabase
        .from('expenses')
        .select('*')
        .like('description', '%(Cost Encoded Later)');
        
    if (expError) throw expError;
    console.log(`Found ${expenses.length} expenses to fix.`);

    const { data: movements, error: movError } = await supabase
        .from('inventory_movements')
        .select('id, timestamp, quantity_change, unit_cost, reason, products(name)')
        .eq('movement_type', 'RESTOCK');

    if (movError) throw movError;

    let fixedCount = 0;
    
    for (const exp of expenses) {
        if (exp.description.startsWith('[')) continue; // already fixed
        
        // Find matching movement
        const matchingMovement = movements.find(m => m.timestamp === exp.expense_date);
        
        if (matchingMovement && matchingMovement.products) {
            const productName = matchingMovement.products.name;
            const newDesc = `[${productName}] ${matchingMovement.reason || 'Bulk receive'} (Cost Encoded Later)`;
            
            console.log(`Fixing: ${exp.description} -> ${newDesc}`);
            const { error: upError } = await supabase
                .from('expenses')
                .update({ description: newDesc })
                .eq('id', exp.id);
                
            if (!upError) fixedCount++;
        }
    }
    
    console.log(`Fixed ${fixedCount} expenses!`);
}

fixExpenses().catch(console.error);
