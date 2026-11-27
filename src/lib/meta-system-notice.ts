/**
 * Meta's chatbot handover notices ("[System] You took over this chat from your AI agent",
 * "[System] Your AI agent transferred this…"). The webhook saves them with
 * sender_type = 'customer', but the customer never wrote them (owner, 2026-11-28).
 * Anything that reads what customers said must skip them.
 */
export const META_SYSTEM_NOTICE_PREFIX = '[System]';

export function isMetaSystemNotice(text: string | null | undefined): boolean {
  return String(text || '').trimStart().startsWith(META_SYSTEM_NOTICE_PREFIX);
}
