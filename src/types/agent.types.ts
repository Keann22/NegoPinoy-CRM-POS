/**
 * agent.types.ts — Types for agent daily tracking logs and compliance.
 */

export type TaskType = 'delete_inactive' | 'add_product' | 'train_intent' | 'other';

export type LogStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export interface AgentDailyLog {
  id: string;
  user_id: string;
  log_date: string; // ISO date string e.g. "2026-06-30"
  task_type: TaskType;
  proof_image_url: string | null;
  image_hash: string | null;
  notes: string | null;
  status: LogStatus;
  ai_feedback: string | null;
  created_at: string;
  // Joined from auth.users via RPC (optional, populated in admin view)
  agent_name?: string;
}

export interface ComplianceTier {
  label: string;
  deductionPercent: number;
  color: string;
  description: string;
}

/**
 * Returns the compliance tier details based on a compliance percentage (0–100).
 */
export function getComplianceTier(compliancePercent: number): ComplianceTier {
  if (compliancePercent === 0) {
    return {
      label: '0% Compliance',
      deductionPercent: 100,
      color: 'destructive',
      description: 'Walang ginawang task sa buong buwan — 100% Forfeiture',
    };
  }
  if (compliancePercent < 50) {
    return {
      label: 'Below 50%',
      deductionPercent: 100,
      color: 'destructive',
      description: 'Below 50% compliance — 100% Forfeiture',
    };
  }
  if (compliancePercent < 70) {
    return {
      label: '50%–69%',
      deductionPercent: 50,
      color: 'destructive',
      description: '50%–69% compliance — 50% deduction sa kabuuang incentive',
    };
  }
  if (compliancePercent < 80) {
    return {
      label: '70%–79%',
      deductionPercent: 20,
      color: 'warning',
      description: '70%–79% compliance — 20% deduction sa kabuuang incentive',
    };
  }
  if (compliancePercent < 92) {
    return {
      label: '80%–91%',
      deductionPercent: 10,
      color: 'warning',
      description: '80%–91% compliance — 10% deduction sa kabuuang incentive',
    };
  }
  return {
    label: '92%–100%',
    deductionPercent: 0,
    color: 'success',
    description: '92%–100% compliance — Walang deduction. Makukuha ang buong incentive!',
  };
}

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  delete_inactive: 'Delete Inactive Items',
  add_product: 'Add New Product',
  train_intent: 'Train Chatbot Intent',
  other: 'Other Task',
};
