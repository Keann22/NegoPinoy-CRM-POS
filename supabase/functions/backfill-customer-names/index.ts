import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PAGE_TOKEN = () => Deno.env.get("META_PAGE_ACCESS_TOKEN")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Fetch all customers with no full_name
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, psid, full_name")
    .or("full_name.is.null,full_name.eq.");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const results = { updated: 0, failed: 0, skipped: 0, total: customers?.length ?? 0 };

  for (const cust of customers ?? []) {
    if (!cust.psid) { results.skipped++; continue; }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${cust.psid}?fields=name,first_name,last_name&access_token=${PAGE_TOKEN()}`
      );
      const data = await res.json();

      if (data.error || !data.name) {
        results.failed++;
        continue;
      }

      // Update customer name
      await supabase
        .from("customers")
        .update({ full_name: data.name })
        .eq("id", cust.id);

      // Also backfill conversation_logs where customer_name is null for this psid
      await supabase
        .from("conversation_logs")
        .update({ customer_name: data.name })
        .eq("customer_psid", cust.psid)
        .is("customer_name", null);

      results.updated++;

      // Small delay to avoid hitting Meta rate limits
      await new Promise(r => setTimeout(r, 50));
    } catch {
      results.failed++;
    }
  }

  return new Response(JSON.stringify({ success: true, ...results }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
