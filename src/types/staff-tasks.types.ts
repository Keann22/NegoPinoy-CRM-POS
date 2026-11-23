/** A task an owner gave a staff member (table staff_tasks, owner 2026-11-23). */
export type StaffTaskStatus = 'open' | 'done' | 'cancelled';
/** Between Seen and Done: "Ginagawa na" or "May problema". */
export type StaffTaskProgress = 'working' | 'problem';

export interface StaffTask {
  id: string;
  message: string;
  orderId: string | null;
  /** "#E702C9C" */
  orderShortId: string | null;
  orderCustomer: string | null;
  /** The order's status now, so the owner sees if "ship this" happened. */
  orderStatus: string | null;
  assigneeName: string;
  assignedByName: string;
  dueAt: string | null;
  status: StaffTaskStatus;
  seenAt: string | null;
  seenByName: string | null;
  progress: StaffTaskProgress | null;
  progressNote: string | null;
  progressAt: string | null;
  progressByName: string | null;
  doneAt: string | null;
  doneByName: string | null;
  doneNote: string | null;
  donePhotoUrl: string | null;
  createdAt: string;
}

/** One staff member to assign to. Several accounts of the same person count as one. */
export interface TaskPerson {
  key: string;
  name: string;
  roles: string[];
}

export interface NewStaffTask {
  personKey: string;
  message: string;
  orderId?: string | null;
  dueAt?: string | null;
}

export type StaffTaskAction = 'seen' | 'working' | 'problem' | 'done' | 'cancel';
