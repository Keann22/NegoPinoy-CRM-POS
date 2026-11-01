import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const { customer_id, items, payment_method, notes, shipping_fee } = await req.json();

  if (!customer_id || !items || items.length === 0) {
    return new Response(JSON.stringify({ error: "customer_id and items required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Calculate totals
    const subtotal = items.reduce((sum: number, item: any) => sum + item.unit_price * item.quantity, 0);
    const total = subtotal + (shipping_fee ?? 0);

    // 2. Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_id,
        status: "Pending",
        total_amount: total,
        payment_method: payment_method ?? "COD",
        shipping_fee: shipping_fee ?? 0,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 3. Insert order items
    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      product_id: item.product_id ?? null,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));
    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) throw itemsError;

    // 4. Update customer lifetime spend + auto-promote tier
    const { data: custData } = await supabase
      .from("customers")
      .select("total_lifetime_spend")
      .eq("id", customer_id)
      .single();

    const currentSpend = Number(custData?.total_lifetime_spend ?? 0);
    const newSpend = currentSpend + total;
    let newTier = "Newbie";
    if (newSpend >= 15000) newTier = "VIP";
    else if (newSpend >= 5000) newTier = "Regular";

    await supabase
      .from("customers")
      .update({ total_lifetime_spend: newSpend, suki_tier: newTier })
      .eq("id", customer_id);

    return new Response(
      JSON.stringify({ success: true, order_id: order.id, new_tier: newTier }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("pos-create-order error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
