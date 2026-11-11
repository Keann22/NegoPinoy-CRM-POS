/**
 * chat.types.ts
 * Centralized type definitions for Live Chat and CRM conversation logs.
 */

export interface ConversationLog {
  id: string;
  customer_psid: string;
  customer_name?: string | null;
  message_text: string;
  sender_type: 'customer' | 'bot' | 'agent' | 'admin' | string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  customers?: {
    id?: string | null;
    full_name?: string | null;
    suki_tier?: string | null;
    mobile_number?: string | null;
    address_line?: string | null;
    city?: string | null;
  } | null;
}

export interface ChatThread {
  psid: string;
  fullName: string;
  sukiTier?: string | null;
  lastMessage: string;
  lastDate: Date;
  lastSender: string;
  unread?: boolean;
  isLinkedAccount?: boolean;
}

export interface CustomerDossier {
  id?: string;
  psid?: string | null;
  full_name?: string | null;
  mobile_number?: string | null;
  location_city?: string | null;
  location_barangay?: string | null;
  location_province?: string | null;
  address_line?: string | null;
  region?: string | null;
  province?: string | null;
  city?: string | null;
  barangay?: string | null;
  postal_code?: string | null;
  street_address?: string | null;
  email?: string | null;
  facebook_profile_link?: string | null;
  store_credit?: number | null;
  stove_type?: string | null;
  family_size?: number | string | null;
  specialty_cuisine?: string | null;
  preferred_payment?: string | null;
  preferred_honorific?: string | null;
  suki_tier?: string | null;
  total_lifetime_spend?: number | null;
  ai_summary_notes?: string | null;
  pain_points?: string | Record<string, unknown> | null;
}

export interface CustomerOrderItem {
  product_name: string;
  quantity: number;
  unit_price?: number | null;
  selling_price_at_sale?: number | null;
}

export interface CustomerOrderSummary {
  id: string;
  status: string;
  total_amount: number;
  balance_due?: number | null;
  amount_paid?: number | null;
  payment_method?: string | null;
  payment_type?: string | null;
  order_date?: string | null;
  created_at: string;
  order_items?: CustomerOrderItem[];
}

export interface MatchedCustomerCandidate {
  id: string;
  psid?: string | null;
  full_name: string;
  mobile_number?: string | null;
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  barangay?: string | null;
  suki_tier?: string | null;
  store_credit?: number | null;
  order_count: number;
  total_spent: number;
  match_type: 'exact' | 'similar' | string;
  /** Phone numbers agree (last 10 digits). */
  phone_match?: boolean;
  /** How the names compare: 'exact', 'similar' or null. */
  name_match?: 'exact' | 'similar' | null;
}

export interface MatchedChatCandidate {
  psid: string;
  chat_customer_id: string;
  chat_customer_name: string;
  mobile_number?: string | null;
  location_city?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  match_type: 'exact' | 'similar' | string;
  phone_match?: boolean;
  name_match?: 'exact' | 'similar' | null;
  /** Orders already on the Messenger contact's record: linking merges two accounts. */
  chat_order_count?: number;
  chat_store_credit?: number;
}

/** What a merge would move when the Messenger contact already has its own account. */
export interface AccountMergeDetail {
  name: string | null;
  orders: number;
  store_credit: number;
  carryovers: number;
  bus_shipments: number;
}

export type ChatLinkResult =
  | { status: 'linked'; customer: Record<string, unknown> }
  | { status: 'needs_merge'; detail: AccountMergeDetail }
  | { status: 'has_other_chat'; message: string }
  | { status: 'error'; message: string };
