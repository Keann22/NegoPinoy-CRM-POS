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

export type ShortDelivery = {
  note: string;
  receivedNow: number;
  /** What was still outstanding on the PO line when this delivery arrived. */
  expectedNow: number;
  missing: number;
  /** Null on messages written before the totals were recorded. */
  orderedTotal: number | null;
  receivedEarlier: number | null;
};

/** Message text for a PO line that arrived short. Keep in sync with parseShortDelivery. */
export function formatShortDelivery(d: {
  note: string;
  receivedNow: number;
  orderedTotal: number;
  receivedEarlier: number;
}): string {
  const expectedNow = Math.max(0, d.orderedTotal - d.receivedEarlier);
  const missing = Math.max(0, expectedNow - d.receivedNow);
  return `Short delivery: received ${d.receivedNow} of ${expectedNow} expected — ${missing} missing. Ordered ${d.orderedTotal}, ${d.receivedEarlier} received earlier. Reason: ${d.note}`;
}

/** Pull the quantities back out of a short-delivery message (current or legacy wording). */
export function parseShortDelivery(message: string): ShortDelivery | null {
  const cur = message.match(
    /^Short delivery: received (\d+) of (\d+) expected — (\d+) missing\. Ordered (\d+), (\d+) received earlier\. Reason: ([\s\S]*)$/
  );
  if (cur) {
    return {
      receivedNow: Number(cur[1]),
      expectedNow: Number(cur[2]),
      missing: Number(cur[3]),
      orderedTotal: Number(cur[4]),
      receivedEarlier: Number(cur[5]),
      note: cur[6],
    };
  }
  const legacy = message.match(/^Discrepancy reported: ([\s\S]*) \(Received (\d+) out of (\d+) remaining\)$/);
  if (legacy) {
    const receivedNow = Number(legacy[2]);
    const expectedNow = Number(legacy[3]);
    return {
      note: legacy[1],
      receivedNow,
      expectedNow,
      missing: Math.max(0, expectedNow - receivedNow),
      orderedTotal: null,
      receivedEarlier: null,
    };
  }
  return null;
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
