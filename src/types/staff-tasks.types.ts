import type { OrderShipContext } from '@/lib/services/order-ship-context-service';

/** A task an owner gave a staff member (table staff_tasks, owner 2026-11-23), or an order note sent to someone. */
export type StaffTaskStatus = 'open' | 'done' | 'cancelled';
/** Between Seen and Done: "Working on it" or "Problem". */
export type StaffTaskProgress = 'working' | 'problem';
/** Stored progress: also 'waiting' = "Customer hasn't replied" (answer buttons, owner 2026-11-25). */
export type StaffTaskStoredProgress = StaffTaskProgress | 'waiting';

/** The answer buttons on a sales task about an order (owner, 2026-11-25). */
export type TaskAnswer = 'ok_to_ship' | 'waiting' | 'cancel';

export interface StaffTask {
  id: string;
  message: string;
  orderId: string | null;
  /** "#E702C9C" */
  orderShortId: string | null;
  orderCustomer: string | null;
  /** The order's status now, so the owner sees if "ship this" happened. */
  orderStatus: string | null;
  /** Hold note, what it still owes, and the customer's other open orders. */
  orderContext?: OrderShipContext | null;
  assigneeName: string;
  assignedByName: string;
  dueAt: string | null;
  status: StaffTaskStatus;
  seenAt: string | null;
  seenByName: string | null;
  progress: StaffTaskStoredProgress | null;
  progressNote: string | null;
  progressAt: string | null;
  progressByName: string | null;
  doneAt: string | null;
  doneByName: string | null;
  doneNote: string | null;
  donePhotoUrl: string | null;
  createdAt: string;
  /** Same task given to several people at once (each has their own copy). */
  groupId: string | null;
  /** Automatic put-back task (order cancelled after picking): one task shared by the put-back team; whoever does it closes it. */
  auto: boolean;
  /** Replies / questions on the task. */
  messageCount: number;
  lastMessageAt: string | null;
  /** An owner replied and the staff member hasn't read it. */
  staffUnread: boolean;
  /** Staff asked or replied and the owners haven't read it. */
  ownerUnread: boolean;
  /** An order note sent to a person or team (kind 'note', owner 2026-11-25). */
  isNote: boolean;
  /** Note: true = "Needs a reply" (open until answered), false = "Just letting you know" (closes at Got it). */
  needsAnswer: boolean;
  /** Note sent to a whole team (one shared copy: whoever answers closes it). */
  team: NoteTeam | null;
  /** Note I sent: they answered (replied or Done) and I haven't read it. */
  senderUnread: boolean;
  /** Note not seen 2 hours after it was sent. */
  unseenTooLong: boolean;
  /** The sender already saw the "not seen in 2 hours" alert. */
  senderNudged: boolean;
  /** Sales answered OK to ship (owner, 2026-11-26): the warehouse copy shows a green tag. */
  okToShipAt: string | null;
  okToShipBy: string | null;
}

export type NoteTeam = 'inventory' | 'owners';

/** Who an order note can be sent to ("Who is it for?"). */
export interface NoteTarget {
  /** 'team:inventory', 'team:owners', or a person key. */
  key: string;
  label: string;
  /** "Jas, Al, Tess, Edric, Rey" or "Sales agent". */
  detail?: string;
  kind: 'team' | 'agent' | 'person';
}

export interface NewOrderNote {
  orderId: string | null;
  message: string;
  targetKeys: string[];
  /** Names tagged with @ in the note (sent to those people too). */
  mentionNames?: string[];
  needsAnswer: boolean;
}

export interface StaffTaskMessage {
  id: string;
  authorName: string;
  fromOwner: boolean;
  body: string;
  photoUrl: string | null;
  createdAt: string;
}

/** One staff member to assign to. Several accounts of the same person count as one. */
export interface TaskPerson {
  key: string;
  name: string;
  roles: string[];
}

export interface NewStaffTask {
  /** One or more people; each gets their own copy. */
  personKeys: string[];
  message: string;
  orderId?: string | null;
  dueAt?: string | null;
}

/** 'ack': the sender read the answer / the 2-hour alert on a note. */
export type StaffTaskAction = 'seen' | 'working' | 'problem' | 'done' | 'cancel' | 'ack' | 'reschedule';
