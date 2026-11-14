/**
 * What staff call the two warehouse units (owner, 2026-11-14). The database
 * codes stay UNIT1 / UNIT2; only these labels are shown on screens.
 *   UNIT1 = 3C, the main shelf where picking happens
 *   UNIT2 = 4A, the reserve (only a few SKUs)
 */
export const UNIT1_LABEL = '3C';
export const UNIT2_LABEL = '4A';

export function warehouseLabel(code: string | null | undefined, fallback?: string | null): string {
  if (code === 'UNIT1') return UNIT1_LABEL;
  if (code === 'UNIT2') return UNIT2_LABEL;
  return fallback || code || '';
}
