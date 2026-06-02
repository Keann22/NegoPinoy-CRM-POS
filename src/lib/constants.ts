/**
 * Shared constants used across the application.
 * Extracted from component-level definitions to ensure a single source of truth.
 */

export const EXPENSE_CATEGORIES = [
    "Marketing",
    "Salaries",
    "Rent",
    "Utilities",
    "Supplies",
    "Travel",
    "Software & Subscriptions",
    "Platform Fees",
    "Shipping Costs",
    "Other"
] as const;

export const PAYMENT_TYPES = ['Full Payment', 'Lay-away', 'Installment', 'COD', 'Pending'] as const;

export const MANAGEMENT_ROLES = ['Admin', 'Owner'] as const;

export const ORDER_STATUSES = ['Pending Payment', 'Processing', 'Shipped', 'Completed', 'Cancelled', 'Payment Received (COD)'] as const;
