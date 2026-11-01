import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const KB_URL = 'https://gist.githubusercontent.com/Keann22/3d64495b5df50aa2c0fbe07711cd3260/raw/92ec77733978ea926f8a6b712673dd8ef90de730/knowledge_base.json';

// Locked 2026-11-01: this function runs with full database power, so it only answers
// callers that send the x-negopinoy-key header matching the INTERNAL_FUNCTION_KEY
// secret. While that secret is not set, every call is refused (the function is off).
// To switch it back on: set the secret in Supabase and send the header from the caller.
function isAllowedCaller(req: Request): boolean {
  const key = Deno.env.get("INTERNAL_FUNCTION_KEY");
  return !!key && req.headers.get("x-negopinoy-key") === key;
}

Deno.serve(async (req: Request) => {
  if (!isAllowedCaller(req)) {
    return new Response(JSON.stringify({ error: "Not allowed" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Fetch knowledge base
    const kbResp = await fetch(KB_URL);
    const rawText = await kbResp.text();
    let rawProducts: any[] = [];
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) rawProducts = parsed;
    else {
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) { rawProducts = parsed[key]; break; }
      }
    }

    if (rawProducts.length === 0) throw new Error('No products found');

    // 2. Clear existing products
    await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Format and insert in batches (NO EMBEDDINGS NEEDED)
    const products = rawProducts.map((p: any) => ({
      name: (p.name || p.id || '').replace(/ \(sale-live\)/g, '').replace(/ \(sale\)/g, '').trim(),
      category: p.category || 'General',
      price: String(p.price || 'Contact for price'),
      description: (p.description || '').substring(0, 1000),
      link: p.link || 'https://www.facebook.com/NegoPinoyPH'
    }));

    const BATCH = 200;
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH);
      const { error } = await supabase.from('products').insert(batch);
      if (error) errors.push(`Batch ${i}: ${error.message}`);
      else inserted += batch.length;
    }

    return new Response(
      JSON.stringify({ success: true, total: products.length, inserted, errors }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
