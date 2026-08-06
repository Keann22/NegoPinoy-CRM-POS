import type { Thread } from '@/types';

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function threadTitle(t: Thread, myId?: string): string {
  if (t.issueType === 'direct') {
    const other = t.members.find((m) => m.userId !== myId);
    return other?.displayName || 'Direct message';
  }
  if (t.orderId) {
    const short = t.orderId.substring(0, 7).toUpperCase();
    return t.customerName ? `ORD-${short} · ${t.customerName}` : `ORD-${short}`;
  }
  if (t.issueType === 'purchase_discrepancy') {
    const batch = t.poBatchName === 'STAFF_DRAFT' ? 'Pending Staff Requests' : t.poBatchName;
    return `PO Shortage · ${batch || 'Unknown Batch'}`;
  }
  return t.productName || 'Product thread';
}
