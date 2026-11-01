import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GEMINI_API_KEY = () => Deno.env.get("GEMINI_API_KEY")!;
const PAGE_TOKEN = () => Deno.env.get("META_PAGE_ACCESS_TOKEN")!;
const VERIFY_TOKEN = () => Deno.env.get("META_VERIFY_TOKEN")!;
const OWNER_PSID = () => Deno.env.get("OWNER_PSID") ?? "";
const APP_SECRET = () => Deno.env.get("META_APP_SECRET") ?? "";

// Facebook signs every webhook POST with the app secret (X-Hub-Signature-256).
// Without this check anyone could post fake messages here, and this function writes to
// the database with the service-role key. Added 2026-11-01. Until the META_APP_SECRET
// secret is set, messages are accepted as before (with a warning in the logs).
async function hasValidSignature(rawBody: Uint8Array, header: string | null): Promise<boolean> {
  const secret = APP_SECRET();
  if (!secret) {
    console.warn("META_APP_SECRET is not set: webhook signature NOT checked.");
    return true;
  }
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice("sha256=".length).toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN()) {
      console.log("Webhook verified successfully!");
      return new Response(challenge!, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    try {
      // Read the exact bytes Facebook signed, check the signature, then parse.
      const rawBody = new Uint8Array(await req.arrayBuffer());
      if (!(await hasValidSignature(rawBody, req.headers.get("x-hub-signature-256")))) {
        console.warn("Rejected webhook POST with a missing or wrong signature.");
        return new Response("Forbidden", { status: 403 });
      }
      const body = JSON.parse(new TextDecoder().decode(rawBody));
      console.log("Incoming Webhook Payload:", JSON.stringify(body, null, 2));
      
      if (body.object !== "page") {
        return new Response("Not a page event", { status: 400 });
      }
      
      // Process payload and ensure runtime execution errors are caught and logged
      EdgeRuntime.waitUntil(processWebhookBody(body).catch(err => {
        console.error("Fatal error in processWebhookBody:", err);
      }));
      
      return new Response("EVENT_RECEIVED", { status: 200 });
    } catch (err) {
      console.error("Error parsing webhook POST body:", err);
      return new Response("Bad Request", { status: 400 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});

async function processWebhookBody(body: any) {
  const entries = body.entry ?? [];
  for (const entry of entries) {
    const events = [
      ...(entry.messaging ?? []),
      ...(entry.standby ?? [])
    ];
    
    console.log(`Processing entry ${entry.id}, found ${events.length} messaging/standby events.`);
    
    for (const event of events) {
      if (!event.message) {
        console.log("Skipping non-message event.");
        continue;
      }
      
      let text = event.message.text;
      if (!text && event.message.attachments?.length > 0) {
        const type = event.message.attachments[0].type;
        text = `[Sent an attachment: ${type}]`;
      }
      
      if (!text) {
        console.log("Skipping event with no text/attachment content.");
        continue;
      }
      
      const isEcho = event.message.is_echo === true;
      // If echo, the sender is the Page and the recipient is the customer
      const psid: string = isEcho ? event.recipient?.id : event.sender?.id;
      if (!psid) {
        console.log("Could not resolve customer PSID from event.");
        continue;
      }
      
      const senderName: string | null = isEcho ? null : (event.sender?.name ?? null);

      try {
        console.log(`Handling message for PSID: ${psid}, isEcho: ${isEcho}, text: "${text}"`);
        await handleMessage(psid, text, senderName, isEcho);
        console.log(`Successfully processed message for PSID: ${psid}`);
      } catch (err) {
        console.error(`handleMessage execution error for PSID ${psid}:`, err);
      }
    }
  }
}

/**
 * Fetches the user's Facebook name via the Graph API.
 */
async function fetchFacebookName(psid: string): Promise<string | null> {
  try {
    const pageToken = PAGE_TOKEN();
    if (!pageToken) return null;
    
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${psid}?fields=name&access_token=${pageToken}`
    );
    const data = await res.json();
    if (!data.error && data.name) return data.name;

    const res2 = await fetch(
      `https://graph.facebook.com/v19.0/me/conversations?user_id=${psid}&fields=participants&access_token=${pageToken}`
    );
    const data2 = await res2.json();
    if (!data2.error && data2.data?.[0]?.participants?.data) {
      const participant = data2.data[0].participants.data.find((p: any) => p.id === psid);
      if (participant?.name) return participant.name;
    }

    return null;
  } catch (err) {
    console.error("fetchFacebookName error:", err);
    return null;
  }
}

async function handleMessage(psid: string, messageText: string, senderName: string | null, isEcho: boolean = false) {
  // 1. ALWAYS ensure the customer record exists first to satisfy foreign key constraints!
  const { data: existingCust, error: fetchErr } = await supabase
    .from("customers")
    .select("*")
    .eq("psid", psid)
    .maybeSingle();

  if (fetchErr) {
    console.error("Error fetching existing customer:", fetchErr);
  }

  // Resolve the best available customer name
  let customerName: string | null = existingCust?.full_name ?? null;
  if (!customerName && !isEcho) {
    if (senderName) {
      customerName = senderName;
    } else {
      customerName = await fetchFacebookName(psid);
    }
  }

  // Upsert the customer record immediately so that fk_conversation_logs_customer is guaranteed to pass
  const upsertPayload: Record<string, any> = { psid };
  if (customerName) upsertPayload.full_name = customerName;
  if (existingCust) {
    upsertPayload.suki_tier = existingCust.suki_tier ?? "Newbie";
    upsertPayload.total_lifetime_spend = existingCust.total_lifetime_spend ?? 0;
  }

  console.log(`Upserting customer record for PSID ${psid}...`);
  await supabase
    .from("customers")
    .upsert(upsertPayload, { onConflict: "psid", ignoreDuplicates: false })
    .throwOnError();

  // --- ADMIN/AGENT REPLIES ---
  if (isEcho) {
    console.log(`Logging Admin/Agent reply to conversation_logs for PSID ${psid}...`);
    await supabase.from("conversation_logs").insert([
      { 
        customer_psid: psid, 
        customer_name: customerName ?? existingCust?.full_name ?? null, 
        message_text: messageText, 
        sender_type: "agent" 
      },
    ]).throwOnError();
    return; // Stop processing further AI/CRM extraction for admin outgoing messages
  }

  // --- CUSTOMER MESSAGES ---
  // Re-fetch fully consolidated customer record
  const { data: cust } = await supabase
    .from("customers")
    .select("*")
    .eq("psid", psid)
    .single()
    .throwOnError();

  // Run Product FTS Search
  const searchTerm = messageText.trim().replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, " ");
  const { data: products } = await supabase
    .from("products")
    .select("name, price, description, category, is_induction_ready")
    .textSearch("search_vector", searchTerm, { type: "websearch", config: "english" })
    .limit(5);

  // Search FAQ / Gold Standard Knowledge
  const { data: knowledgeRows } = await supabase
    .from("gold_standard_knowledge")
    .select("question, answer")
    .textSearch("question", searchTerm, { type: "websearch" })
    .eq("is_verified", true)
    .limit(3);

  // Detect Price inquiries without matching products
  const priceKeywords = ["magkano", "hm", "presyo", "price", "how much", "halaga", "cost", "bayad"];
  const isPriceQuery = priceKeywords.some(k => messageText.toLowerCase().includes(k));
  const noProductFound = !products || products.length === 0;

  if (isPriceQuery && noProductFound) {
    console.log(`Triggering Price Not Found owner alert for query: "${messageText}"`);
    await supabase.from("owner_alerts").insert({
      alert_type: "price_not_found",
      customer_psid: psid,
      original_query: messageText,
    }).throwOnError();
  }

  // Extract CRM context dynamically
  await extractAndUpdateCRM(psid, messageText);

  // Log incoming customer message safely with throwOnError
  const resolvedName = cust?.full_name ?? customerName ?? null;
  console.log(`Inserting incoming customer message into conversation_logs for ${resolvedName ?? psid}...`);
  await supabase.from("conversation_logs").insert([
    { 
      customer_psid: psid, 
      customer_name: resolvedName, 
      message_text: messageText, 
      sender_type: "customer" 
    },
  ]).throwOnError();
}

async function extractAndUpdateCRM(psid: string, message: string) {
  const updates: Record<string, string> = {};

  const mobileMatch = message.match(/\b(09\d{9}|(\+63)\d{10})\b/);
  if (mobileMatch) updates.mobile_number = mobileMatch[0];

  const stoveMap: Record<string, string> = {
    induction: "Induction", gas: "Gas", electric: "Electric",
    lutuan: "Traditional", kalan: "Traditional",
  };
  for (const [kw, val] of Object.entries(stoveMap)) {
    if (message.toLowerCase().includes(kw)) { updates.stove_type = val; break; }
  }

  const cities = ["Manila", "Cebu", "Davao", "Quezon City", "Makati", "Pasig", "Taguig",
    "Marikina", "Caloocan", "Mandaluyong", "Paranaque", "Las Pinas", "Muntinlupa",
    "Valenzuela", "Malabon", "Navotas", "Pasay", "Pateros", "San Juan", "Cavite",
    "Laguna", "Batangas", "Rizal", "Bulacan", "Pampanga", "Bataan", "Zambales"];
  for (const city of cities) {
    if (message.toLowerCase().includes(city.toLowerCase())) { updates.location_city = city; break; }
  }

  if (Object.keys(updates).length > 0) {
    console.log(`Applying CRM auto-updates for PSID ${psid}:`, JSON.stringify(updates));
    await supabase.from("customers").update(updates).eq("psid", psid).throwOnError();
  }
}
