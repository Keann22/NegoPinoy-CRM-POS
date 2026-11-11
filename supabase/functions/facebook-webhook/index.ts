import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { syncRecentConversations, autoLinkChatCustomerIfExactMatch, fillMissingCustomerDetails } from "./sync.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GEMINI_API_KEY = () => Deno.env.get("GEMINI_API_KEY")!;
const PAGE_TOKEN = () => Deno.env.get("META_PAGE_ACCESS_TOKEN")!;
const VERIFY_TOKEN = () => Deno.env.get("META_VERIFY_TOKEN")!;
const OWNER_PSID = () => Deno.env.get("OWNER_PSID") ?? "";
const APP_SECRET = () => Deno.env.get("META_APP_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
      const rawBody = new Uint8Array(await req.arrayBuffer());
      const bodyText = new TextDecoder().decode(rawBody);
      const body = JSON.parse(bodyText);

      // --- 1. CRM ACTIONS (send_reply / sync_messages) ---
      if (body.action === "send_reply" || body.action === "sync_messages") {
        // Require a valid logged-in staff JWT or service role key
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          return new Response(JSON.stringify({ error: "Missing authorization header" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const token = authHeader.replace(/^Bearer\s+/i, "");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        if (token !== serviceKey) {
          const { data: userData, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !userData?.user) {
            return new Response(JSON.stringify({ error: "Unauthorized user" }), {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        const pageToken = PAGE_TOKEN();
        if (!pageToken) {
          return new Response(JSON.stringify({ error: "META_PAGE_ACCESS_TOKEN not configured" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (body.action === "sync_messages") {
          const syncResult = await syncRecentConversations(supabase, pageToken, body.psid);
          return new Response(JSON.stringify({ success: true, ...syncResult }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { psid, text } = body;
        if (!psid || !text?.trim()) {
          return new Response(JSON.stringify({ error: "Missing psid or text" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const graphUrl = `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(pageToken)}`;
        let fbRes = await fetch(graphUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: psid },
            messaging_type: "RESPONSE",
            message: { text: text.trim() },
          }),
        });
        let fbData = await fbRes.json();

        // If Meta Business Suite AI Agent owns the thread (code 10 / subcode 2018300), send with HUMAN_AGENT tag
        if (!fbRes.ok || fbData.error) {
          console.log("Retrying send_reply with HUMAN_AGENT tag after RESPONSE error:", fbData.error?.message);
          fbRes = await fetch(graphUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: psid },
              messaging_type: "MESSAGE_TAG",
              tag: "HUMAN_AGENT",
              message: { text: text.trim() },
            }),
          });
          fbData = await fbRes.json();
        }

        if (!fbRes.ok || fbData.error) {
          console.error("Facebook Send API error:", fbData);
          return new Response(
            JSON.stringify({
              error: fbData.error?.message || "Failed to send via Facebook Graph API",
              fbError: fbData.error,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(JSON.stringify({ success: true, fbData }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- 2. INCOMING FACEBOOK WEBHOOK ---
      // Read the exact bytes Facebook signed, check the signature, then process.
      if (!(await hasValidSignature(rawBody, req.headers.get("x-hub-signature-256")))) {
        console.warn("Rejected webhook POST with a missing or wrong signature.");
        return new Response("Forbidden", { status: 403 });
      }
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
      let imageUrl: string | null = null;
      if (event.message.attachments?.length > 0) {
        const att = event.message.attachments[0];
        if (att.type === "image" && att.payload?.url) {
          imageUrl = att.payload.url;
        }
        if (!text) {
          text = att.type === "image" ? "[Sent a photo]" : `[Sent an attachment: ${att.type}]`;
        }
      }
      if (!text && event.message.admin_text) {
        text = `[System] ${event.message.admin_text}`;
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
        await handleMessage(psid, text, senderName, isEcho, imageUrl);
        console.log(`Successfully processed message for PSID: ${psid}`);
      } catch (err) {
        console.error(`handleMessage execution error for PSID ${psid}:`, err);
      }
    }
  }

  // Also sync recent conversations from Graph API whenever any webhook fires (catches AI-handled customer messages 24/7)
  try {
    await syncRecentConversations(supabase, PAGE_TOKEN());
  } catch (syncErr) {
    console.error("Background conversation sync warning:", syncErr);
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

async function handleMessage(psid: string, messageText: string, senderName: string | null, isEcho: boolean = false, imageUrl: string | null = null) {
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
  if (!customerName) {
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

  await autoLinkChatCustomerIfExactMatch(supabase, psid, customerName, existingCust?.mobile_number ?? null);

  // --- ADMIN/AGENT REPLIES ---
  if (isEcho) {
    // Dedup check: if an agent already inserted this reply from the CRM within the last 15 seconds, skip duplicate
    const fifteenSecsAgo = new Date(Date.now() - 15000).toISOString();
    const { data: recentReply } = await supabase
      .from("conversation_logs")
      .select("id")
      .eq("customer_psid", psid)
      .eq("sender_type", "agent")
      .eq("message_text", messageText)
      .gte("created_at", fifteenSecsAgo)
      .limit(1);

    if (recentReply && recentReply.length > 0) {
      console.log(`Skipping duplicate echo for CRM-sent reply to PSID ${psid}.`);
      return;
    }

    console.log(`Logging Admin/Agent reply to conversation_logs for PSID ${psid}...`);
    await supabase.from("conversation_logs").insert([
      { 
        customer_psid: psid, 
        customer_name: customerName ?? existingCust?.full_name ?? null, 
        message_text: messageText, 
        sender_type: "agent",
        metadata: imageUrl ? { image_url: imageUrl } : null
      },
    ]).throwOnError();
    return; // Stop processing further AI/CRM extraction for admin outgoing messages
  }

  // Log incoming customer message FIRST so that even if FTS or CRM extraction fails, the message is ALWAYS saved!
  const resolvedName = customerName ?? existingCust?.full_name ?? null;
  console.log(`Inserting incoming customer message into conversation_logs for ${resolvedName ?? psid}...`);
  await supabase.from("conversation_logs").insert([
    { 
      customer_psid: psid, 
      customer_name: resolvedName, 
      message_text: messageText, 
      sender_type: "customer",
      metadata: imageUrl ? { image_url: imageUrl } : null
    },
  ]).throwOnError();

  // Extract CRM context dynamically (non-blocking)
  try {
    await extractAndUpdateCRM(psid, messageText);
  } catch (crmErr) {
    console.error(`Non-fatal CRM extraction error for PSID ${psid}:`, crmErr);
  }

  // Run Product FTS Search & Price Alert (non-blocking)
  try {
    const searchTerm = messageText.trim().replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, " ");
    const { data: products } = await supabase
      .from("products")
      .select("name, price, description, category, is_induction_ready")
      .textSearch("search_vector", searchTerm, { type: "websearch", config: "english" })
      .limit(5);

    const priceKeywords = ["magkano", "hm", "presyo", "price", "how much", "halaga", "cost", "bayad"];
    const isPriceQuery = priceKeywords.some(k => messageText.toLowerCase().includes(k));
    const noProductFound = !products || products.length === 0;

    if (isPriceQuery && noProductFound) {
      console.log(`Triggering Price Not Found owner alert for query: "${messageText}"`);
      await supabase.from("owner_alerts").insert({
        alert_type: "price_not_found",
        customer_psid: psid,
        original_query: messageText,
      });
    }
  } catch (searchErr) {
    console.error(`Non-fatal product search error for PSID ${psid}:`, searchErr);
  }
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

  // Only fills empty fields: a number typed in chat may be the receiver's (OFWs)
  const applied = await fillMissingCustomerDetails(supabase, psid, updates);
  if (Object.keys(applied).length > 0) {
    console.log(`Applied CRM auto-updates for PSID ${psid}:`, JSON.stringify(applied));
  }
  if (applied.mobile_number) {
    await autoLinkChatCustomerIfExactMatch(supabase, psid, null, applied.mobile_number);
  }
}
