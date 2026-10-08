export type PhotoReviewOrder = {
  id: string;
  customerId: string;
  customerName: string;
  status: string;
  orderDate: string;
  photoSince: string | null;
  totalAmount: number;
  balanceDue: number;
  salesPersonName: string;
  notes: string;
  items: { name: string; quantity: number }[];
  units: number;
};

export const PHOTO_REVIEW_FINDINGS = [
  'Should be cancelled',
  'Already shipped / completed',
  'Still active - keep in Photo',
  'Other',
] as const;

// Every review note starts with this marker so the review page can tell which orders are done.
export const PHOTO_REVIEW_MARKER = 'Photo review';

const FINDING_RE = new RegExp(`^${PHOTO_REVIEW_MARKER} - (.+?):`, 'gm');

export function buildPhotoReviewNote(finding: string, text: string): string {
  return `${PHOTO_REVIEW_MARKER} - ${finding}: ${text.trim()}`;
}

/** The finding of the most recent review note on the order, or null if it has not been reviewed. */
export function latestReviewFinding(notes: string): string | null {
  const matches = [...(notes || '').matchAll(FINDING_RE)];
  return matches.length ? matches[matches.length - 1][1] : null;
}
