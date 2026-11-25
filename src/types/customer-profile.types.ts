/**
 * customer-profile.types.ts
 * Centralized types for Customer Persona & Profile (orders + Messenger chats).
 */

export type PersonaType =
  | 'nanay_home'
  | 'small_negosyo'
  | 'ofw_sender'
  | 'reseller'
  | 'gift_buyer'
  | 'browser_lead'
  | 'other';

export type NextActionType =
  | 'recommend'
  | 'payment_followup'
  | 'restock_alert'
  | 'check_in'
  | 'wait';

export type PriceTier = 'budget' | 'mid' | 'premium' | 'mixed';

export type StaffProfileVerdict = 'accurate' | 'needs_fix';

export interface CustomerLifeClue {
  clue: string;
  evidence: string;
}

export interface UnboughtInquiry {
  item: string;
  context: string;
  wasOutOfStock?: boolean;
}

export interface CustomerBuyingStyle {
  paymentPreference: string;
  shippingPreference: string;
  priceTier: PriceTier;
  favoriteCategories: string[];
  communicationStyle: string;
  paydayPattern?: string | null;
}

export interface CustomerRecommendation {
  productId?: string | null;
  productName: string;
  price?: number | null;
  reason: string;
}

export interface CustomerPersonaMetrics {
  orderCount: number;
  completedOrderCount: number;
  cancelledOrReturnedCount: number;
  totalSpent: number;
  avgOrderValue: number;
  codCount: number;
  layawayCount: number;
  installmentCount: number;
  fullPaymentCount: number;
  busShipCount: number;
  overdueLayawayCount: number;
  overdueBalanceTotal: number;
  differentReceiverCount: number;
  chatMessageCount: number;
  customerMessageCount: number;
  lastChatAt: string | null;
  lastOrderAt: string | null;
  within24hWindow: boolean;
}

export interface CustomerProfile {
  id: string;
  customerId: string;
  psid: string | null;
  personaType: PersonaType;
  personaLabel: string;
  summary: string;
  confidence: number;
  interests: string[];
  unboughtInquiries: UnboughtInquiry[];
  lifeClues: CustomerLifeClue[];
  objectionsAndPainPoints: string[];
  buyingStyle: CustomerBuyingStyle;
  salesTips: string[];
  nextActionType: NextActionType;
  recommendedItems: CustomerRecommendation[];
  draftMessage: string | null;
  metrics: CustomerPersonaMetrics;
  sourceOrderCount: number;
  sourceMessageCount: number;
  lastMessageAt: string | null;
  modelUsed: string | null;
  staffVerdict: StaffProfileVerdict | null;
  staffCorrectionNote: string | null;
  staffVerifiedBy: string | null;
  staffVerifiedAt: string | null;
  generatedAt: string;
  updatedAt: string;
}

export interface CustomerProfileMeta {
  isStale: boolean;
  newOrdersCount: number;
  newMessagesCount: number;
  within24hWindow: boolean;
}

export interface CustomerProfileResponse {
  profile: CustomerProfile | null;
  meta: CustomerProfileMeta;
}

export interface CustomerProfileListItem {
  customerId: string;
  personaType: PersonaType;
  personaLabel: string;
  summary: string;
  nextActionType: NextActionType;
  within24hWindow: boolean;
  overdueLayawayCount: number;
  staffVerdict: StaffProfileVerdict | null;
  generatedAt: string;
}

/** One rule for "Worth Messaging Today", used by the list API and the Customers page. */
export function isWorthMessagingToday(
  p: Pick<CustomerProfileListItem, 'nextActionType' | 'overdueLayawayCount' | 'within24hWindow'>
): boolean {
  return (
    p.nextActionType === 'payment_followup' ||
    p.overdueLayawayCount > 0 ||
    (p.within24hWindow && (p.nextActionType === 'recommend' || p.nextActionType === 'restock_alert'))
  );
}

export const PERSONA_META: Record<
  PersonaType,
  { label: string; shortLabel: string; description: string; badgeClass: string }
> = {
  nanay_home: {
    label: 'Nanay / Home Buyer',
    shortLabel: 'Nanay / Home',
    description: 'Buys cookware & appliances for family home use.',
    badgeClass:
      'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25',
  },
  small_negosyo: {
    label: 'Small Negosyo',
    shortLabel: 'Negosyo',
    description: 'Sari-sari store, eatery, karinderya, or home baker.',
    badgeClass:
      'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
  },
  ofw_sender: {
    label: 'OFW Sender',
    shortLabel: 'OFW',
    description: 'Abroad buyer ordering gifts or appliances for family in PH.',
    badgeClass:
      'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25',
  },
  reseller: {
    label: 'Reseller / Bulk Buyer',
    shortLabel: 'Reseller',
    description: 'Buys multiple units or repeats fast-moving stock to resell.',
    badgeClass:
      'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25',
  },
  gift_buyer: {
    label: 'Gift / Occasion Buyer',
    shortLabel: 'Gift Buyer',
    description: 'Shops for weddings, housewarmings, birthdays, or holidays.',
    badgeClass:
      'bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/25',
  },
  browser_lead: {
    label: 'Browser / Inquiry Lead',
    shortLabel: 'Chat Lead',
    description: 'Asked about items on Messenger without completing an order yet.',
    badgeClass:
      'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25',
  },
  other: {
    label: 'General Customer',
    shortLabel: 'General',
    description: 'Mixed or not enough clues yet to classify narrowly.',
    badgeClass:
      'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/25',
  },
};

export const NEXT_ACTION_META: Record<
  NextActionType,
  { label: string; badgeClass: string }
> = {
  recommend: {
    label: 'Recommend Item',
    badgeClass:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  },
  payment_followup: {
    label: 'Follow Up Payment',
    badgeClass:
      'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25',
  },
  restock_alert: {
    label: 'Restock Alert',
    badgeClass:
      'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
  },
  check_in: {
    label: 'Check In',
    badgeClass:
      'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25',
  },
  wait: {
    label: 'Wait / No Pitch',
    badgeClass:
      'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25',
  },
};
