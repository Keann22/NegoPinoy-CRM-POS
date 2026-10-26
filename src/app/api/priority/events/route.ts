import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPriorityCaller } from '@/lib/priority/priority-auth';
import { addPriorityEvent, type PriorityEventKind } from '@/lib/services/priority-list-service';
import { notifyUrgent } from '@/lib/services/priority-notify-service';
import { phtDate, sendDateFor, BLOCK_REASONS, type BlockReason } from '@/lib/priority/priority-rules';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// os_decision has its own route (/api/priority/decision).
const KINDS: PriorityEventKind[] = [
  'followup', 'hold', 'hold_cleared',
  'send_today', 'send_today_blocked', 'send_today_cancelled',
  'urgent', 'urgent_cleared',
];

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Priority list actions on one order. Who did it comes from the session.
 * Body: { orderId, kind, note?, holdUntil?, override?, reason? }
 *  - followup / hold / hold_cleared: customer follow-ups and hold dates
 *  - send_today: sales or jas mark it (after 11 AM it lands on tomorrow unless admin/jas overrides)
 *  - send_today_cancelled: sales or jas remove the mark
 *  - send_today_blocked: warehouse can't send it today; reason required (customer_hold also sets a hold)
 */
export async function POST(req: Request) {
  try {
    const caller = await getPriorityCaller();
    if (!caller) return bad('Not signed in', 401);
    const { isAdmin, isJas, canDecide: canMark } = caller;

    const { orderId, kind, note, holdUntil, override, reason } = await req.json();
    const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';
    const today = phtDate(new Date());

    if (typeof orderId !== 'string' || !UUID.test(orderId)) return bad('Invalid order');
    if (!KINDS.includes(kind)) return bad('Invalid action');

    const needsHoldDate = kind === 'hold' || (kind === 'send_today_blocked' && reason === 'customer_hold');
    if (needsHoldDate) {
      if (typeof holdUntil !== 'string' || !DATE.test(holdUntil)) return bad('Pick the date the order should come back.');
      if (holdUntil < today) return bad('The hold date is already past.');
    }
    if (kind === 'followup' && cleanNote.length < 2) return bad('Add a short note about the follow-up (e.g. "asked on live").');
    if (kind === 'hold' && cleanNote.length < 2) return bad('Add why the customer asked to hold.');
    if ((kind === 'send_today' || kind === 'send_today_cancelled') && !canMark) {
      return bad('Only sales and the jas accounts can mark orders for sending today.', 403);
    }
    if (kind === 'send_today' && cleanNote.length < 2) return bad('Add why it has to go out today.');
    if ((kind === 'urgent' || kind === 'urgent_cleared') && !canMark) {
      return bad('Only sales, admins and the jas accounts can mark a customer as nagmamadali.', 403);
    }
    if (kind === 'urgent' && cleanNote.length < 2) return bad('Add what the customer said (e.g. "kailangan bago Nov 5").');
    if (kind === 'send_today_blocked') {
      if (!(reason in BLOCK_REASONS)) return bad('Pick why it can\'t be sent today.');
      if (reason === 'other' && cleanNote.length < 2) return bad('Add what is stopping it.');
    }

    const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).maybeSingle();
    if (!order) return bad('Order not found', 404);

    const who = { id: caller.id, name: caller.name };
    let sendDate: string | null = null;
    if (kind === 'send_today') sendDate = sendDateFor(new Date(), override === true && (isAdmin || isJas));

    await addPriorityEvent(supabase, {
      orderId,
      kind,
      note: cleanNote,
      holdUntil,
      sendDate,
      reasonCode: kind === 'send_today_blocked' ? (reason as BlockReason) : null,
    }, who);

    // "Customer asked to hold" from the warehouse also puts the order on hold.
    if (kind === 'send_today_blocked' && reason === 'customer_hold') {
      await addPriorityEvent(supabase, { orderId, kind: 'hold', note: cleanNote || 'Customer asked to hold (from send today)', holdUntil }, who);
    }

    // Owner/admins hear about it right away, with what's missing, so they can follow up or buy.
    if (kind === 'urgent') {
      await notifyUrgent(supabase, orderId, cleanNote, caller.name).catch((e) => console.error('urgent notify failed', e));
    }

    return NextResponse.json({ ok: true, sendDate });
  } catch (error: any) {
    console.error('Error in priority events POST:', error);
    return bad(error.message || 'Failed to save', 500);
  }
}
