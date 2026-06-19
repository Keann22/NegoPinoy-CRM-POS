/**
 * customer.types.ts
 * Centralized customer-related type definitions.
 * All components and hooks must import customer types from here.
 */

export type CustomerStatus = 'Active' | 'Inactive' | 'Blacklisted';

export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  barangay?: string;
  city?: string;
  province?: string;
  region?: string;
  zipCode?: string;
  notes?: string;
  status?: CustomerStatus;
  overpaymentBalance?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomerWithStats = Customer & {
  totalOrders: number;
  totalSpent: number;
  totalBalance: number;
  lastOrderDate?: string;
};
