import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordGuardianMemory } from '@/lib/services/inventory/inventory-guardian-memory-service';
import { getUnpickedQtyForProduct, stockLevelForUnallocated } from '@/lib/services/inventory/shelf-stock-service';
import { setShelfStock } from '@/lib/services/inventory/shelf-stock-ledger';

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

    // 2. Units on orders no picker has taken yet (still on the shelf).
    const unpicked = await getUnpickedQtyForProduct(supabase, productId);

    // LOCKED formula (shelf-stock-service.ts): unallocated = stock_level + unpicked,
    // so the stock_level for the typed shelf count is shelf − unpicked.
    const currentStock = product.stock_level ?? 0;
    const desiredUnallocated = Number(newUnallocatedStock);
    const targetStockLevel = stockLevelForUnallocated(desiredUnallocated, unpicked.qty);
    const discrepancy = targetStockLevel - currentStock;

    // 3. Update product stock_level in DB
    const { error: updErr } = await supabase
      .from('products')
      .update({ stock_level: targetStockLevel })
      .eq('id', productId);

    if (updErr) throw updErr;

    const fullReason = `Procurement Edit (${reasonCode}): ${notes || 'No extra notes'}`;

    // 4. Log inventory movement
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

    // The typed number is what is on the shelf: set the stored shelf stock to it.
    try {
      await setShelfStock(supabase, productId, desiredUnallocated, { reason: fullReason, actorName });
    } catch (e) {
      console.error('Failed to set shelf stock from Edit Unallocated Stock:', e);
    }

    // 5. Alert AI Inventory Guardian & Record Memory
    await recordGuardianMemory(supabase, {
      productId,
      actionType: 'physical_count_audit',
      physicalCount: targetStockLevel,
      systemStockBefore: currentStock,
      systemStockAfter: targetStockLevel,
      discrepancy,
      actorName,
      notes: `[Procurement Direct Edit] Target Unallocated: ${desiredUnallocated} (Waiting to be picked: ${unpicked.qty} pcs on ${unpicked.orderCount} orders). Reason: ${reasonCode}. Notes: ${notes || 'None'}`
    });

    // 6. Create Owner / Guardian Alert
    try {
      await supabase.from('owner_alerts').insert({
        title: `🛡️ AI Inventory Guardian: Unallocated Stock Adjusted`,
        message: `Unallocated stock for '${product.name}' was set to ${desiredUnallocated} (System stock level adjusted from ${currentStock} to ${targetStockLevel}) by ${actorName}. Reason: ${reasonCode}. Notes: ${notes || 'No additional notes.'}`,
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
      newUnallocatedStock: desiredUnallocated,
      newStockLevel: targetStockLevel,
      discrepancy,
      productName: product.name
    });

  } catch (error: any) {
    console.error('Error updating unallocated stock via procurement:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
