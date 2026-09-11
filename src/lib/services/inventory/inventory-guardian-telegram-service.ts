import { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryAnomaly } from '@/types';
import { recordGuardianMemory } from './inventory-guardian-memory-service';

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

/**
 * Retrieves configured Telegram bot credentials from environment variables.
 */
export function getTelegramConfig(): TelegramConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN?.trim(),
    chatId: process.env.TELEGRAM_CHAT_ID?.trim()
  };
}

/**
 * Sends a raw text or HTML message to Telegram via the Bot API.
 */
export async function sendTelegramMessage(
  text: string,
  customConfig?: TelegramConfig
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const config = {
    botToken: customConfig?.botToken || getTelegramConfig().botToken,
    chatId: customConfig?.chatId || getTelegramConfig().chatId
  };

  if (!config.botToken) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN is not configured.' };
  }
  if (!config.chatId) {
    return { success: false, error: 'TELEGRAM_CHAT_ID is not configured.' };
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return {
        success: false,
        error: data.description || `Telegram API error (${res.status})`
      };
    }

    return { success: true, messageId: data.result?.message_id };
  } catch (err: any) {
    console.error('Failed to send Telegram message:', err);
    return { success: false, error: err.message || 'Network error communicating with Telegram.' };
  }
}

/**
 * Formats and dispatches a push notification for an inventory anomaly.
 * Includes a 12-hour deduplication window so staff aren't spammed with repeat alerts.
 */
export async function notifyInventoryAnomaly(
  supabase: SupabaseClient,
  anomaly: InventoryAnomaly,
  baseUrl: string = 'https://pos.negopinoy.com'
): Promise<{ sent: boolean; reason?: string }> {
  const config = getTelegramConfig();
  if (!config.botToken || !config.chatId) {
    return { sent: false, reason: 'Telegram credentials not configured' };
  }

  try {
    // 1. Throttling / Deduplication check: Has this product been notified in the past 12 hours?
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data: recentNotifs } = await supabase
      .from('inventory_guardian_memory')
      .select('id, created_at')
      .eq('product_id', anomaly.productId)
      .eq('action_type', 'anomaly_notified')
      .gte('created_at', twelveHoursAgo)
      .limit(1);

    if (recentNotifs && recentNotifs.length > 0) {
      return { sent: false, reason: 'Already notified within the past 12 hours' };
    }

    // 2. Format Telegram HTML alert message
    const severityEmoji = anomaly.severity === 'high' ? '🚨' : '⚠️';
    const typeLabel = anomaly.type === 'unrecorded_purchase'
      ? '📦 Unrecorded Purchase / Delivery'
      : anomaly.type === 'picker_shortage'
      ? '🔍 Floor Shortage Reported'
      : '⚠️ Stock Discrepancy';

    let memoryConflictText = '';
    if (anomaly.memoryContext?.hasMemoryConflict && anomaly.memoryContext.lastVerifiedCount !== undefined) {
      const verifiedDate = anomaly.memoryContext.lastVerifiedAt
        ? new Date(anomaly.memoryContext.lastVerifiedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
        : 'recently';
      memoryConflictText = `\n⚠️ <b>Memory Conflict:</b> ${anomaly.memoryContext.lastVerifiedBy || 'Staff'} verified <b>${anomaly.memoryContext.lastVerifiedCount}</b> units on shelf on ${verifiedDate}. Please check shelf before repurchasing!\n`;
    }

    const message = [
      `${severityEmoji} <b>Inventory Guardian Alert</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `🏷 <b>Product:</b> ${escapeHtml(anomaly.productName)}`,
      anomaly.sku ? `🔖 <b>SKU:</b> <code>${escapeHtml(anomaly.sku)}</code>` : '',
      `📉 <b>Ledger Stock:</b> <code>${anomaly.currentStock}</code>`,
      `📋 <b>Open Orders:</b> <code>${anomaly.unfulfilledQty} unit(s)</code>`,
      `📌 <b>Type:</b> ${typeLabel}`,
      memoryConflictText,
      `📝 <b>What happened:</b> ${escapeHtml(anomaly.description)}`,
      ``,
      `💡 <b>Action:</b> ${escapeHtml(anomaly.recommendation)}`,
      `━━━━━━━━━━━━━━━━━━`,
      `👉 <a href="${baseUrl}/dashboard">Open Dashboard to Resolve</a>`
    ]
      .filter(Boolean)
      .join('\n');

    // 3. Send message
    const sendResult = await sendTelegramMessage(message, config);
    if (!sendResult.success) {
      console.warn('Telegram notification failed:', sendResult.error);
      return { sent: false, reason: sendResult.error };
    }

    // 4. Record to memory table so it's not spammed again
    await recordGuardianMemory(supabase, {
      productId: anomaly.productId,
      actionType: 'anomaly_notified',
      systemStockBefore: anomaly.currentStock,
      notes: `Alert sent to Telegram for ${anomaly.type}`,
      metadata: {
        anomalyId: anomaly.id,
        severity: anomaly.severity,
        telegramMessageId: sendResult.messageId
      }
    });

    return { sent: true };
  } catch (err: any) {
    console.error('Error dispatching anomaly notification to Telegram:', err);
    return { sent: false, reason: err.message };
  }
}

/**
 * Sends a test ping to verify bot connectivity and chat ID validity.
 */
export async function testTelegramConnection(
  customConfig?: TelegramConfig
): Promise<{ success: boolean; error?: string }> {
  const timestamp = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const message = [
    `🛡️ <b>NegoPinoy Inventory Guardian</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `✅ <b>Telegram Connection Successful!</b>`,
    ``,
    `Your Telegram bot is now active and linked to NegoPinoy CRM POS.`,
    `You will receive real-time push alerts here whenever:`,
    `• Negative stocks occur from unrecorded deliveries`,
    `• Pickers report missing stock on the floor`,
    `• Memory conflicts are detected between physical counts and floor reports`,
    ``,
    `🕒 <i>Tested at: ${timestamp}</i>`
  ].join('\n');

  return sendTelegramMessage(message, customConfig);
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
