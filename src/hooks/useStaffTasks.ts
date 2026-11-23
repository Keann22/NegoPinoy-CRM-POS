'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { NewStaffTask, StaffTask, StaffTaskAction, TaskPerson } from '@/types/staff-tasks.types';

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
 * My tasks: one shared copy for the pop-up, the dashboard card and the menu badge,
 * so they poll once and update together.
 */
let mine: StaffTask[] = [];
let loaded = false;
const listeners = new Set<() => void>();
let timer: number | null = null;

async function loadMine() {
  try {
    const json = await call<{ tasks: StaffTask[] }>({ query: '?view=mine' });
    mine = json.tasks || [];
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

export function useMyTasks() {
  const tasks = useSyncExternalStore(subscribe, () => mine, () => EMPTY);
  const open = tasks.filter((t) => t.status === 'open');
  return { tasks, open, loaded, reload: loadMine };
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

export async function createStaffTask(input: NewStaffTask): Promise<string> {
  const json = await call<{ id: string }>({ method: 'POST', body: JSON.stringify(input) });
  await loadMine();
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
  return json.id;
}
