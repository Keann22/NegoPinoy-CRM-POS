/**
 * Types for Inventory Staff Activity History ("My Activity").
 * Keeps supplier names, unit costs, and receipt photos strictly excluded.
 */

export type ActivityCategory =
  | 'picking'
  | 'checking'
  | 'packing'
  | 'receiving'
  | 'counting'
  | 'transfers'
  | 'returns'
  | 'tasks'
  | 'shipping';

export type ActivityDatePreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export type ActivityBadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface StaffActivityBadge {
  label: string;
  tone: ActivityBadgeTone;
}

export interface StaffActivityItem {
  id: string;
  category: ActivityCategory;
  actionLabel: string;
  title: string;
  detail?: string | null;
  actorName: string;
  timestamp: string;
  href?: string | null;
  badges?: StaffActivityBadge[];
}

export interface StaffActivitySummary {
  totalActions: number;
  byCategory: Record<ActivityCategory, number>;
  receivedPieces: number;
  countsMatched: number;
  countsTotal: number;
}

export interface StaffActivityPersonOption {
  key: string;
  name: string;
  roles: string[];
  isInventoryTeam: boolean;
}

export interface StaffActivityResponse {
  items: StaffActivityItem[];
  summary: StaffActivitySummary;
  totalFiltered: number;
  hasMore: boolean;
  resolvedPersonKey: string;
  resolvedPersonName: string;
  isManagement: boolean;
  staffOptions: StaffActivityPersonOption[];
  dateRange: {
    from: string;
    to: string;
    preset: ActivityDatePreset;
  };
}
