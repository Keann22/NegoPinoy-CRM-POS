import type { SupabaseClient } from '@supabase/supabase-js';
import { addOrderNote } from '@/lib/services/order-trail-service';
import { phtToday } from '@/lib/shipping/ship-hold-rules';
import { inventoryTeam } from './staff-note-service';

/*
 * Tell the warehouse when sales say "OK to ship" (owner, 2026-11-26).
 * Found 2026-11-26: the owner gave "Please pick and book" to Jas and the sales
 * agent together; sales answered OK to ship on 25 orders in half an hour, but
 * only their own copy closed, so Jas never knew.
 *
 * - The warehouse copy of the same task (same group, or any open task on the
 *   order given to Inventory staff) gets the answer as a reply, so it pops up
 *   again, and shows a green "OK to ship" tag until they tap Done.
 * - A task only sales had (no warehouse copy ever): one shared task goes to the
 *   Inventory team; whoever books it taps Done (the sales agent gets the bell).
 * - A warehouse copy the owners cancelled (e.g. taken off Jas for Photo orders)
 *   is left alone.
 */

interface AnsweredTask {
  id: string;
  order_id: string | null;
  group_id: string | null;
}

/** Due today 6 PM PHT; tomorrow noon when it's after 4 PM (same as put-back tasks). */
function dueAt(now = new Date()): string {
  const phtHour = (now.getUTCHours() + 8) % 24;
  const today = phtToday();
  if (phtHour < 16) return new Date(`${today}T18:00:00+08:00`).toISOString();
  const tomorrow = new Date(new Date(`${today}T12:00:00+08:00`).getTime() + 24 * 3600 * 1000);
  return tomorrow.toISOString();
}

export interface OkToShipResult {
  /** Warehouse copies that got the answer. */
  told: string[];
  /** New shared Inventory task, if one was made. */
  created: string | null;
}

export async function tellWarehouseOkToShip(
  supabase: SupabaseClient,
  task: AnsweredTask,
  by: { id: string; name: string },
  note?: string | null,
  at = new Date().toISOString(),
): Promise<OkToShipResult> {
  if (!task.order_id) return { told: [], created: null };
  const team = await inventoryTeam(supabase);
  const isWarehouse = (ids: string[]) => ids.some((id) => team.ids.includes(id));

  const { data: others, error } = await supabase
    .from('staff_tasks')
    .select('id, status, group_id, assignee_ids, ok_to_ship_at')
    .eq('order_id', task.order_id)
    .is('kind', null)
    .neq('id', task.id);
  if (error) throw error;
  const warehouse = (others || []).filter((t) => isWarehouse(t.assignee_ids as string[]));
  const open = warehouse.filter((t) => t.status === 'open');
  const body = `OK to ship${note ? `: ${note}` : ''}`;

  const told: string[] = [];
  for (const t of open) {
    if (t.ok_to_ship_at) continue; // already told
    const { error: mErr } = await supabase.from('staff_task_messages').insert({
      task_id: t.id, author_id: by.id, author_name: by.name, from_owner: true, body,
    });
    if (mErr) throw mErr;
    const { error: uErr } = await supabase
      .from('staff_tasks')
      .update({ ok_to_ship_at: at, ok_to_ship_by: by.name, last_message_at: at, last_message_from_owner: true })
      .eq('id', t.id)
      .eq('status', 'open');
    if (uErr) throw uErr;
    told.push(t.id as string);
  }

  let created: string | null = null;
  // A warehouse copy of this same task that's done or cancelled: the owners already handled it.
  const hadWarehouseCopy = !!task.group_id && warehouse.some((t) => t.group_id === task.group_id);
  if (open.length === 0 && !hadWarehouseCopy && team.ids.length) {
    const { data, error: iErr } = await supabase
      .from('staff_tasks')
      .insert({
        message: 'OK to ship: pick, pack and book',
        order_id: task.order_id,
        assignee_ids: team.ids,
        assignee_name: 'Inventory',
        assigned_by_id: by.id,
        assigned_by_name: by.name,
        due_at: dueAt(),
        ok_to_ship_at: at,
        ok_to_ship_by: by.name,
      })
      .select('id')
      .single();
    if (iErr) throw iErr;
    created = data.id as string;
  }

  if (told.length || created) {
    await addOrderNote(supabase, task.order_id, `OK to ship (sales): the warehouse was told${note ? ` · ${note}` : ''}`, by.name);
  }
  return { told, created };
}
