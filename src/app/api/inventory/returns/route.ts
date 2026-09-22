import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveOpenOrderIssues } from '@/lib/services/order-issues-service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');

    let query = supabase
      .from('returns')
      .select('*')
      .order('created_at', { ascending: false });

    if (orderId) query = query.eq('order_id', orderId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ returns: data || [] });
  } catch (error: any) {
    console.error('Error in GET /returns:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

interface ReturnItemInput {
  orderItemId?: string;
  productId: string;
  productName?: string;
  quantity: number;
  returnType?: 'restock' | 'exchange' | 'writeoff';
  reasonCode?: string;
  notes?: string;
}

async function processSingleReturnItem(
  orderId: string,
  item: ReturnItemInput,
  defaultReturnType: string | undefined,
  defaultReasonCode: string | undefined,
  defaultNotes: string | undefined,
  processedBy: string | null
) {
  const returnType = item.returnType || defaultReturnType;
  const reasonCode = item.reasonCode || defaultReasonCode || null;
  const notes = item.notes || defaultNotes || null;

  if (!item.productId || !item.quantity || !returnType) {
    throw new Error('Missing product, quantity, or disposition for return item.');
  }
  if (!['restock', 'exchange', 'writeoff'].includes(returnType)) {
    throw new Error(`Invalid return type: ${returnType}`);
  }

  const { data: returnRecord, error: insertError } = await supabase
    .from('returns')
    .insert({
      order_id: orderId,
      order_item_id: item.orderItemId || null,
      product_id: item.productId,
      product_name: item.productName || null,
      quantity: item.quantity,
      return_type: returnType,
      reason_code: reasonCode,
      notes: notes,
      processed_by: processedBy,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  if (returnType === 'restock') {
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('name, assembly_recipe')
      .eq('id', item.productId)
      .single();
    if (prodErr) throw prodErr;

    const recipe = Array.isArray(product?.assembly_recipe) ? product.assembly_recipe : [];
    const targets = recipe.length > 0
      ? recipe
          .map((c: any) => ({ id: c.productId || c.component_id, qty: item.quantity * (c.quantity || 1), bundle: product?.name }))
          .filter((t: any) => t.id)
      : [{ id: item.productId, qty: item.quantity, bundle: null }];

    for (const t of targets) {
      const { error: rpcError } = await supabase.rpc('increment_stock', {
        p_product_id: t.id,
        qty: t.qty,
        new_unit_cost: 0,
      });
      if (rpcError) throw rpcError;

      await supabase.from('inventory_movements').insert({
        product_id: t.id,
        quantity_change: t.qty,
        movement_type: 'return',
        reason: t.bundle ? `Return to Stock: Order #${orderId} (Bundle: ${t.bundle})` : `Return to Stock: Order #${orderId}`,
      });
    }
  }

  return returnRecord.id;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId, items, processedBy, defaultReturnType, defaultReasonCode, defaultNotes } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    const itemsToProcess: ReturnItemInput[] = Array.isArray(items)
      ? items.filter((i: ReturnItemInput) => i.quantity > 0)
      : body.productId && body.quantity > 0
      ? [{
          orderItemId: body.orderItemId,
          productId: body.productId,
          productName: body.productName,
          quantity: body.quantity,
          returnType: body.returnType,
          reasonCode: body.reasonCode,
          notes: body.notes,
        }]
      : [];

    if (itemsToProcess.length === 0) {
      return NextResponse.json({ error: 'No items with quantity > 0 to return.' }, { status: 400 });
    }

    const createdIds: string[] = [];
    for (const item of itemsToProcess) {
      const returnId = await processSingleReturnItem(
        orderId,
        item,
        defaultReturnType || body.returnType,
        defaultReasonCode || body.reasonCode,
        defaultNotes || body.notes,
        processedBy || null
      );
      createdIds.push(returnId);
    }

    // Check if order is now fully returned
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('id, quantity')
      .eq('order_id', orderId);

    const { data: allReturns } = await supabase
      .from('returns')
      .select('order_item_id, quantity')
      .eq('order_id', orderId);

    const returnedByItem = new Map<string, number>();
    (allReturns || []).forEach(r => {
      if (r.order_item_id) {
        returnedByItem.set(r.order_item_id, (returnedByItem.get(r.order_item_id) || 0) + r.quantity);
      }
    });

    const allItemsFullyReturned = (orderItems && orderItems.length > 0)
      ? orderItems.every(oi => (returnedByItem.get(oi.id) || 0) >= oi.quantity)
      : false;

    if (allItemsFullyReturned) {
      await supabase.from('orders').update({ status: 'Returned' }).eq('id', orderId);
      await resolveOpenOrderIssues(supabase, orderId, processedBy || 'System');
    }

    return NextResponse.json({
      success: true,
      processedCount: createdIds.length,
      allItemsFullyReturned,
    });
  } catch (error: any) {
    console.error('Error in POST /returns:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
