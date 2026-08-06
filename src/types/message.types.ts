export type ThreadMessage = {
  id: string;
  sender_role: string | null;
  sender_name: string | null;
  message: string;
  created_at: string;
  requires_attention: boolean;
  mentions: string[] | null;
};

export type Thread = {
  id: string;
  issueType: string;
  status: string;
  orderId: string | null;
  orderStatus: string | null;
  customerName: string | null;
  productName: string | null;
  poBatchName: string | null;
  reportedByName: string | null;
  createdAt: string;
  messages: ThreadMessage[];
  members: { userId: string; displayName: string }[];
  lastActivityAt: string;
  unreadCount: number;
};
