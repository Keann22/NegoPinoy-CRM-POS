/**
 * accounting.types.ts
 * Centralized accounting-related type definitions.
 * All components and hooks must import accounting types from here.
 */

export type ExpenseCategory =
  | 'Rent'
  | 'Utilities'
  | 'Salaries'
  | 'Shipping'
  | 'Packaging'
  | 'Marketing'
  | 'Platform Fees'
  | 'Supplies'
  | 'Maintenance'
  | 'Other';

export type Expense = {
  id: string;
  amount: number;
  category: ExpenseCategory | string;
  description?: string;
  expenseDate: string;
  receiptUrl?: string;
  isRecurring?: boolean;
  recurringExpenseId?: string;
  createdBy?: string;
  createdAt?: string;
};

export type RecurringExpense = {
  id: string;
  amount: number;
  category: ExpenseCategory | string;
  description?: string;
  frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
  dayOfMonth?: number;
  isActive: boolean;
  lastPostedAt?: string;
  createdAt?: string;
};

export type SpxRemittance = {
  id: string;
  referenceNumber: string;
  amount: number;
  remittanceDate: string;
  status: 'Pending' | 'Verified' | 'Discrepancy';
  orders?: SpxRemittanceOrder[];
  receiptUrl?: string;
  notes?: string;
};

export type SpxRemittanceOrder = {
  orderId: string;
  trackingNumber: string;
  codAmount: number;
};

export type FinancialSummary = {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  totalAccountsReceivable: number;
  arCount: number;
};
