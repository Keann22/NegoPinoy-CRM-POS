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
  metadata?: Record<string, any> | null;
  customers?: {
    full_name?: string | null;
    suki_tier?: string | null;
    mobile_number?: string | null;
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
}

export interface CustomerDossier {
  id?: string;
  psid?: string;
  full_name?: string | null;
  mobile_number?: string | null;
  location_city?: string | null;
  location_barangay?: string | null;
  location_province?: string | null;
  street_address?: string | null;
  email?: string | null;
  stove_type?: string | null;
  family_size?: number | string | null;
  specialty_cuisine?: string | null;
  preferred_payment?: string | null;
  preferred_honorific?: string | null;
  suki_tier?: string | null;
  total_lifetime_spend?: number | null;
  ai_summary_notes?: string | null;
  pain_points?: string | Record<string, any> | null;
}

export interface CustomerOrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface CustomerOrderSummary {
  id: string;
  order_number?: string;
  status: string;
  total_amount: number;
  payment_method?: string;
  created_at: string;
  order_items?: CustomerOrderItem[];
}
