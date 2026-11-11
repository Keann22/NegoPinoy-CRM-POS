import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const PAGE_ID = "101058226004061";

export async function autoLinkChatCustomerIfExactMatch(
  supabase: SupabaseClient,
  psid: string,
  fullName: string | null,
  mobileNumber?: string | null
) {
  try {
    const { data: currentCust } = await supabase
      .from("customers")
      .select("id, address_line, city, mobile_number, full_name")
      .eq("psid", psid)
      .maybeSingle();

    // Already linked to a complete POS customer account
    if (currentCust?.address_line || currentCust?.city) {
      return;
    }

    const nameToMatch = fullName || currentCust?.full_name || null;
    const phoneToMatch = mobileNumber || currentCust?.mobile_number || null;
    if (!nameToMatch && !phoneToMatch) return;

    const { data: matches } = await supabase.rpc("find_matching_customers_for_chat", {
      p_psid: psid,
      p_name: nameToMatch,
      p_phone: phoneToMatch,
    });

    if (!matches || !Array.isArray(matches)) return;

    const exactUnlinkedMatches = matches.filter(
      (m: any) => m.match_type === "exact" && !m.psid
    );

    // Auto-merge only when there is a single unambiguous exact match on file
    if (exactUnlinkedMatches.length === 1) {
      await supabase.rpc("link_chat_psid_to_customer", {
        p_psid: psid,
        p_customer_id: exactUnlinkedMatches[0].id,
      });
    }
  } catch (err) {
    console.warn("Non-fatal autoLinkChatCustomerIfExactMatch warning:", err);
  }
}

export async function syncRecentConversations(supabase: SupabaseClient, pageToken: string) {
  const url = `https://graph.facebook.com/v19.0/me/conversations?fields=participants,messages.limit(6){message,from,created_time,id}&limit=8&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || "Failed to fetch conversations from Graph API");
  }

  let insertedCount = 0;
  const conversations = data.data ?? [];

  for (const conv of conversations) {
    const participants = conv.participants?.data ?? [];
    const customer = participants.find((p: any) => p.id && p.id !== PAGE_ID);
    if (!customer) continue;

    const psid: string = customer.id;
    const fullName: string | null = customer.name ?? null;

    // 1. Upsert customer with real Facebook name
    const upsertData: Record<string, any> = { psid };
    if (fullName) upsertData.full_name = fullName;
    await supabase.from("customers").upsert(upsertData, { onConflict: "psid" });

    // 1b. Auto-link to existing POS customer account if there is a single exact name/phone match
    await autoLinkChatCustomerIfExactMatch(supabase, psid, fullName, null);

    // 2. Backfill missing or placeholder customer_name in conversation_logs for this PSID
    if (fullName) {
      await supabase
        .from("conversation_logs")
        .update({ customer_name: fullName })
        .eq("customer_psid", psid)
        .or("customer_name.is.null,customer_name.like.Customer-%");
    }

    // 3. Check existing recent messages for this PSID
    const { data: existingLogs } = await supabase
      .from("conversation_logs")
      .select("id, message_text, created_at, metadata")
      .eq("customer_psid", psid)
      .order("created_at", { ascending: false })
      .limit(25);

    const existingList = existingLogs ?? [];
    const messages = [...(conv.messages?.data ?? [])].reverse();

    for (const msg of messages) {
      const text = msg.message?.trim();
      if (!text) continue;

      const fbMid = msg.id;
      const msgTimeMs = new Date(msg.created_time).getTime();
      const isFromPage = msg.from?.id === PAGE_ID;
      const senderType = isFromPage ? "agent" : "customer";

      const alreadyExists = existingList.some((log: any) => {
        if (log.metadata?.fb_mid && log.metadata.fb_mid === fbMid) return true;
        if (log.message_text === text) {
          const logTimeMs = new Date(log.created_at).getTime();
          if (Math.abs(logTimeMs - msgTimeMs) < 120000) return true;
        }
        return false;
      });

      if (!alreadyExists) {
        const { data: inserted } = await supabase
          .from("conversation_logs")
          .insert([
            {
              customer_psid: psid,
              customer_name: fullName,
              message_text: text,
              sender_type: senderType,
              created_at: msg.created_time,
              metadata: { fb_mid: fbMid },
            },
          ])
          .select("id, message_text, created_at, metadata")
          .single();

        if (inserted) {
          existingList.push(inserted);
          insertedCount++;
          if (senderType === "customer") {
            await extractCustomerDetailsFromSync(supabase, psid, fullName, text);
          }
        }
      }
    }
  }

  return { syncedConversations: conversations.length, insertedCount };
}

async function extractCustomerDetailsFromSync(
  supabase: SupabaseClient,
  psid: string,
  fullName: string | null,
  message: string
) {
  try {
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
      await supabase.from("customers").update(updates).eq("psid", psid);
    }

    if (updates.mobile_number) {
      await autoLinkChatCustomerIfExactMatch(supabase, psid, fullName, updates.mobile_number);
    }
  } catch {
    // Non-fatal if mobile number already exists on another record
  }
}
