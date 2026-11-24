'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { NewOrderNote, NewStaffTask, NoteTarget, StaffTask, StaffTaskAction, StaffTaskMessage, TaskPerson } from '@/types/staff-tasks.types';
import type { OrderShipContext } from '@/lib/services/order-ship-context-service';

const API = '/api/tasks';
/** Fired after any task change, so lists that load their own copy can reload. */
export const TASKS_CHANGED_EVENT = 'staff-tasks-changed';
const POLL_MS = 3 * 60 * 1000;

async function call<T>(init: RequestInit & { query?: string } = {}): Promise<T> {
  const { query, ...rest } = init;
  const res = await fetch(`${API}${query || ''}`, {
    cache: 'no-store',
    ...rest,
    headers: rest.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong');
  return json as T;
}

/*
 * My tasks and notes, and the notes I sent: one shared copy for the pop-up, the
 * dashboard card and the menu badge, so they poll once and update together.
 */
let mine: StaffTask[] = [];
let sent: StaffTask[] = [];
let loaded = false;
const listeners = new Set<() => void>();
let timer: number | null = null;

async function loadMine() {
  try {
    const json = await call<{ tasks: StaffTask[]; sent?: StaffTask[] }>({ query: '?view=mine' });
    mine = json.tasks || [];
    sent = json.sent || [];
    loaded = true;
    listeners.forEach((l) => l());
  } catch {
    // Offline or signed out: keep what we have.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void loadMine();
    timer = window.setInterval(loadMine, POLL_MS);
    window.addEventListener('focus', loadMine);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) window.clearInterval(timer);
      timer = null;
      window.removeEventListener('focus', loadMine);
    }
  };
}

const EMPTY: StaffTask[] = [];

/** Actions on a task; reloads my tasks afterwards. */
export async function actOnTask(id: string, action: StaffTaskAction, extra: { note?: string; photoUrl?: string | null } = {}) {
  await call({ method: 'PATCH', body: JSON.stringify({ id, action, ...extra }) });
  await loadMine();
  // Owner list and order page reload on this.
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
}

export async function uploadTaskPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/photo`, { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Photo not uploaded');
  return json.url as string;
}

/** Notes I sent (open, answered this week). Shares the poll with useMyTasks. */
export function useSentNotes() {
  const notes = useSyncExternalStore(subscribe, () => sent, () => EMPTY);
  // Answered and not read yet, or nobody saw it in 2 hours (shown once).
  const needsMe = notes.filter((n) => n.senderUnread || (n.unseenTooLong && !n.senderNudged));
  return { notes, needsMe, reload: loadMine };
}

export function useMyTasks() {
  const tasks = useSyncExternalStore(subscribe, () => mine, () => EMPTY);
  const open = tasks.filter((t) => t.status === 'open');
  // Open tasks, plus finished ones with an owner reply not read yet.
  const active = tasks.filter((t) => t.status === 'open' || t.staffUnread);
  return { tasks, open, active, loaded, reload: loadMine };
}

/** Owners: everyone's tasks (Tasks page). */
export function useAllTasks(enabled: boolean, days = 14) {
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      const json = await call<{ tasks: StaffTask[] }>({ query: `?view=all&days=${days}` });
      setTasks(json.tasks || []);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, days]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API on mount
  useEffect(() => { void reload().catch(() => undefined); }, [reload]);
  return { tasks, isLoading, reload };
}

/** Tasks on one order (order page). */
export function useOrderTasks(orderId: string | null | undefined) {
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const reload = useCallback(async () => {
    if (!orderId) return;
    try {
      const json = await call<{ tasks: StaffTask[] }>({ query: `?view=order&orderId=${encodeURIComponent(orderId)}` });
      setTasks(json.tasks || []);
    } catch {
      // Not critical on the order page.
    }
  }, [orderId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API on mount
  useEffect(() => { void reload(); }, [reload]);
  return { tasks, reload };
}

/** Who an order note can go to ("Para kanino?"). Loaded once per order. */
export function useNoteTargets(orderId: string | null | undefined, enabled = true) {
  const [loaded, setLoaded] = useState<{ key: string; targets: NoteTarget[] } | null>(null);
  const key = orderId || '';
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    call<{ targets: NoteTarget[] }>({ query: `?view=noteTargets${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ''}` })
      .then((json) => { if (alive) setLoaded({ key, targets: json.targets || [] }); })
      .catch(() => { if (alive) setLoaded({ key, targets: [] }); });
    return () => { alive = false; };
  }, [orderId, key, enabled]);
  return loaded?.key === key ? loaded.targets : [];
}

/** Sends an order note to the people / teams picked (any staff). */
export async function sendOrderNote(input: NewOrderNote): Promise<string[]> {
  const json = await call<{ ids: string[] }>({ method: 'POST', body: JSON.stringify({ kind: 'note', ...input }) });
  await loadMine();
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
  return json.ids;
}

/** Owners: notes nobody saw 2 hours after they were sent. */
export function useUnseenNotes(enabled: boolean) {
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const json = await call<{ tasks: StaffTask[] }>({ query: '?view=unseenNotes' });
      setTasks(json.tasks || []);
    } catch {
      // Not critical.
    }
  }, [enabled]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API on mount
    void reload();
    const onChange = () => { void reload(); };
    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, onChange);
  }, [reload]);
  return { tasks, reload };
}

/** Owners: who can be given a task. Loaded when the assign dialog opens. */
export function useTaskPeople(enabled: boolean) {
  const [people, setPeople] = useState<TaskPerson[]>([]);
  useEffect(() => {
    if (!enabled || people.length > 0) return;
    call<{ people: TaskPerson[] }>({ query: '?view=people' })
      .then((json) => setPeople(json.people || []))
      .catch(() => setPeople([]));
  }, [enabled, people.length]);
  return people;
}

/** Assign task: is the order held, does it or the customer's other orders still owe? (owners) */
export function useOrderShipContext(orderId: string | null | undefined) {
  // Keyed by order, so a different order never shows the previous one's context.
  const [loaded, setLoaded] = useState<{ orderId: string; context: OrderShipContext | null } | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    call<{ context: OrderShipContext | null }>({ query: `?view=orderContext&orderId=${encodeURIComponent(orderId)}` })
      .then((json) => { if (alive) setLoaded({ orderId, context: json.context || null }); })
      .catch(() => { if (alive) setLoaded({ orderId, context: null }); });
    return () => { alive = false; };
  }, [orderId]);
  return orderId && loaded?.orderId === orderId ? loaded.context : null;
}

export async function createStaffTask(input: NewStaffTask): Promise<string[]> {
  const json = await call<{ ids: string[] }>({ method: 'POST', body: JSON.stringify(input) });
  await loadMine();
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
  return json.ids;
}

/** Replies on a task. Reading them marks them read for my side, so lists reload. */
export async function fetchTaskMessages(taskId: string): Promise<StaffTaskMessage[]> {
  const res = await fetch(`${API}/messages?taskId=${encodeURIComponent(taskId)}`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not load the replies');
  await loadMine();
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
  return json.messages || [];
}

export async function sendTaskMessage(taskId: string, body: string, photoUrl?: string | null): Promise<void> {
  const res = await fetch(`${API}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, body, photoUrl: photoUrl || null }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Not sent');
  await loadMine();
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
}
