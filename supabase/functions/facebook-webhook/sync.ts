import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const PAGE_ID = "101058226004061";

/**
 * Connect a Messenger contact to a customer account automatically ONLY when the
 * phone number AND the name both agree with exactly one account that has no chat
 * yet, and the Messenger record has no orders / store credit of its own.
 * Everything less certain is left for staff to confirm in Live Chat.
 * Pairs staff marked "not the same person" are excluded by the database.
 */
export async function autoLinkChatCustomerIfExactMatch(
  supabase: SupabaseClient,
  psid: string,
  fullName: string | null,
  mobileNumber?: string | null
) {
  try {
    const { data: currentCust } = await supabase
      .from("customers")
      .select("id, address_line, city, mobile_number, full_name, store_credit, orders(count)")
      .eq("psid", psid)
      .maybeSingle();

    // Already a real account (address, orders or credit): never merge it automatically
    const orderCount = Number((currentCust as any)?.orders?.[0]?.count ?? 0);
    if (
      currentCust?.address_line || currentCust?.city || orderCount > 0 ||
      Math.abs(Number(currentCust?.store_credit ?? 0)) > 0.009
    ) {
      return;
    }

    const nameToMatch = fullName || currentCust?.full_name || null;
    const phoneToMatch = mobileNumber || currentCust?.mobile_number || null;
    // Both are needed: a name alone (common names) or a phone alone (OFWs send the
    // receiver's number) is not enough to merge without asking.
    if (!nameToMatch || !phoneToMatch || nameToMatch.startsWith("Customer-")) return;

    const { data: matches } = await supabase.rpc("find_matching_customers_for_chat", {
      p_psid: psid,
      p_name: nameToMatch,
      p_phone: phoneToMatch,
    });

    if (!matches || !Array.isArray(matches)) return;

    const safe = matches.filter(
      (m: any) => !m.psid && m.phone_match === true && (m.name_match === "exact" || m.name_match === "similar")
    );

    if (safe.length === 1) {
      const { error } = await supabase.rpc("link_chat_psid_to_customer", {
        p_psid: psid,
        p_customer_id: safe[0].id,
        p_merge_accounts: false,
        p_method: "auto_phone_name",
      });
      if (error) console.warn("Auto-link skipped:", error.message);
    }
  } catch (err) {
    console.warn("Non-fatal autoLinkChatCustomerIfExactMatch warning:", err);
  }
}

/**
 * Make sure a customers row exists for this PSID. The Facebook name only fills an
 * empty or placeholder name: once a chat is linked to an account, the account's
 * real name (used on shipping labels) must not be replaced by the Facebook name.
 */
export async function ensureChatCustomer(supabase: SupabaseClient, psid: string, fullName: string | null) {
  const { data: existing } = await supabase
    .from("customers")
    .select("id, full_name")
    .eq("psid", psid)
    .maybeSingle();

  if (!existing) {
    await supabase
      .from("customers")
      .upsert(fullName ? { psid, full_name: fullName } : { psid }, { onConflict: "psid", ignoreDuplicates: true });
    return;
  }
  const current = (existing.full_name || "").trim();
  if (fullName && (!current || current.startsWith("Customer-"))) {
    await supabase.from("customers").update({ full_name: fullName }).eq("id", existing.id);
  }
}

/**
 * Phone and city read from a chat message only fill EMPTY fields. A number typed in chat is
 * often the receiver's (OFWs), so it must never replace the number on an account.
 */
export async function fillMissingCustomerDetails(
  supabase: SupabaseClient,
  psid: string,
  updates: Record<string, string>
): Promise<Record<string, string>> {
  if (Object.keys(updates).length === 0) return {};
  const { data: current } = await supabase
    .from("customers")
    .select("mobile_number, location_city")
    .eq("psid", psid)
    .maybeSingle();
  const fillOnly = new Set(["mobile_number", "location_city"]);
  const toApply: Record<string, string> = {};
  for (const [key, value] of Object.entries(updates)) {
    const existing = (current as Record<string, unknown> | null)?.[key];
    if (!fillOnly.has(key) || existing === null || existing === undefined || String(existing).trim() === "") {
      toApply[key] = value;
    }
  }
  if (Object.keys(toApply).length > 0) {
    const { error } = await supabase.from("customers").update(toApply).eq("psid", psid);
    if (error) {
      console.warn("fillMissingCustomerDetails skipped:", error.message);
      return {};
    }
  }
  return toApply;
}

export async function syncRecentConversations(
  supabase: SupabaseClient,
  pageToken: string,
  targetPsid?: string
) {
  // Background sync is a backstop for the webhook: keep it small (8 chats x 6 messages,
  // the sizes that worked before 2026-11-12). Asking for 15 x 50 with attachment fields
  // made every background sync fail. Only text is saved here, so no attachment fields.
  const msgLimit = targetPsid ? 100 : 6;
  const userFilter = targetPsid ? `user_id=${encodeURIComponent(targetPsid)}&` : "limit=8&";
  const url = `https://graph.facebook.com/v19.0/me/conversations?${userFilter}fields=participants,messages.limit(${msgLimit}){message,from,created_time,id}&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) {
    console.error("Graph API conversations error:", JSON.stringify(data.error ?? { status: res.status }));
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

    // 1. Make sure the customer row exists (Facebook name only fills a missing name)
    await ensureChatCustomer(supabase, psid, fullName);

    // 1b. Auto-link only when phone AND name match one account
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
      .limit(200);

    const existingList = existingLogs ?? [];
    const allRawMessages = [...(conv.messages?.data ?? [])];

    // If syncing a specific customer thread, paginate up to 3 pages (300 messages) from the start
    let nextUrl: string | undefined = targetPsid ? conv.messages?.paging?.next : undefined;
    let pageCount = 0;
    while (nextUrl && pageCount < 3) {
      pageCount++;
      const nextRes = await fetch(nextUrl);
      const nextData = await nextRes.json();
      if (nextData?.data?.length) {
        allRawMessages.push(...nextData.data);
        nextUrl = nextData.paging?.next;
      } else {
        break;
      }
    }

    const messages = allRawMessages.reverse();

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

    const applied = await fillMissingCustomerDetails(supabase, psid, updates);
    if (applied.mobile_number) {
      await autoLinkChatCustomerIfExactMatch(supabase, psid, fullName, applied.mobile_number);
    }
  } catch {
    // Non-fatal if mobile number already exists on another record
  }
}
