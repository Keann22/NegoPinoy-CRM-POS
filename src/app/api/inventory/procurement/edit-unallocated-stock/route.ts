import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordGuardianMemory } from '@/lib/services/inventory/inventory-guardian-memory-service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, newUnallocatedStock, reasonCode, notes, actorName = 'Inventory Staff' } = body;

    if (!productId || typeof newUnallocatedStock !== 'number' || !reasonCode) {
      return NextResponse.json({ error: 'Missing required parameters (productId, newUnallocatedStock, reasonCode)' }, { status: 400 });
    }

    // 1. Fetch current product
    const { data: product, error: pErr } = await supabase
      .from('products')
      .select('id, name, stock_level')
      .eq('id', productId)
      .single();

    if (pErr || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const currentStock = product.stock_level ?? 0;
    const targetStockLevel = Number(newUnallocatedStock);
    const discrepancy = targetStockLevel - currentStock;

    // 2. Update product stock_level in DB
    const { error: updErr } = await supabase
      .from('products')
      .update({ stock_level: targetStockLevel })
      .eq('id', productId);

    if (updErr) throw updErr;

    const fullReason = `Procurement Edit (${reasonCode}): ${notes || 'No extra notes'}`;

    // 3. Log inventory movement
    const { error: movErr } = await supabase
      .from('inventory_movements')
      .insert({
        product_id: productId,
        quantity_change: discrepancy,
        movement_type: 'adjustment',
        reason: fullReason,
        supplier_name: 'Procurement Sheet Correction'
      });

    if (movErr) {
      console.error('Failed to log inventory movement:', movErr);
    }

    // 4. Alert AI Inventory Guardian & Record Memory
    await recordGuardianMemory(supabase, {
      productId,
      actionType: 'physical_count_audit',
      physicalCount: targetStockLevel,
      systemStockBefore: currentStock,
      systemStockAfter: targetStockLevel,
      discrepancy,
      actorName,
      notes: `[Procurement Direct Edit] Reason: ${reasonCode}. Notes: ${notes || 'None'}`
    });

    // 5. Create Owner / Guardian Alert
    try {
      await supabase.from('owner_alerts').insert({
        title: `🛡️ AI Inventory Guardian: Unallocated Stock Adjusted`,
        message: `Stock for '${product.name}' was directly updated to ${targetStockLevel} by ${actorName}. Reason: ${reasonCode}. Notes: ${notes || 'No additional notes.'}`,
        product_id: productId,
        severity: Math.abs(discrepancy) > 5 ? 'high' : 'medium',
        is_read: false,
        created_at: new Date().toISOString()
      });
    } catch (alertErr) {
      console.error('Failed to create owner alert:', alertErr);
    }

    return NextResponse.json({
      success: true,
      newStockLevel: targetStockLevel,
      discrepancy,
      productName: product.name
    });

  } catch (error: any) {
    console.error('Error updating unallocated stock via procurement:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
