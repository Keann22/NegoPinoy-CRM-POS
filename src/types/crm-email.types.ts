/**
 * crm-email.types.ts
 * Centralized type definitions for CRM Email Sender.
 */

export interface CrmEmailRecipient {
  id: string;
  name: string;
  email: string;
  sukiTier?: string;
  phone?: string;
  lifetimeSpend?: number;
}

export interface CrmEmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  body: string;
}

export type EmailDeliveryStatus = 'sent' | 'simulated' | 'failed' | 'received';
export type EmailDeliveryMode = 'resend' | 'smtp' | 'simulated' | 'imap';
export type EmailDirection = 'inbound' | 'outbound';

export interface CrmEmailLog {
  id: string;
  customer_id?: string | null;
  recipient_email: string;
  recipient_name?: string | null;
  subject: string;
  body: string;
  status: EmailDeliveryStatus;
  mode: EmailDeliveryMode;
  direction?: EmailDirection;
  message_id?: string | null;
  in_reply_to?: string | null;
  thread_id?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface CrmEmailThread {
  email: string;
  customerName: string;
  sukiTier?: string;
  lastSubject: string;
  lastMessageAt: string;
  unreadCount: number;
  messages: CrmEmailLog[];
}

export interface SendEmailRequestPayload {
  recipients: CrmEmailRecipient[];
  subject: string;
  body: string;
}

export interface SendEmailResultItem {
  email: string;
  name?: string;
  success: boolean;
  status: EmailDeliveryStatus;
  error?: string;
}

export interface SendEmailResponse {
  success: boolean;
  mode: EmailDeliveryMode;
  sentCount: number;
  totalRequested: number;
  results: SendEmailResultItem[];
  message: string;
}
