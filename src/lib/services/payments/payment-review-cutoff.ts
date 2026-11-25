/**
 * Payments made before this date were logged while the app was still being
 * tested (owner, 2026-11-25). If they were never verified, they are left out of
 * the Payments Log "Pending" list, its count, GCash statement matching and the
 * owners' to-do. They are not deleted: Verified and Rejected tabs still show
 * them, and so do the orders.
 *
 * 2026-07-01 00:00 Philippine time, written in UTC so it is safe inside
 * PostgREST `or()` filters.
 */
export const PAYMENT_REVIEW_START_UTC = '2026-06-30T16:00:00Z';
export const PAYMENT_REVIEW_START_LABEL = 'July 1, 2026';
