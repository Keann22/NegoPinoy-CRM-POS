import { SUPPLIER_FLAG_BADGE, SUPPLIER_FLAG_LABELS, isCheckDue } from '@/lib/supplier-stock/supplier-flag-rules';
import type { SupplierFlag } from '@/types/supplier-stock.types';

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });

/** Small status chip for an item out at the supplier. */
export function SupplierFlagBadge({ flag, showCheck = false }: { flag: SupplierFlag; showCheck?: boolean }) {
  const due = isCheckDue(flag.checkAgainOn);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${SUPPLIER_FLAG_BADGE[flag.status]}`}>
        {SUPPLIER_FLAG_LABELS[flag.status]}
      </span>
      {showCheck && flag.checkAgainOn && (
        <span className={`text-[10px] ${due ? 'font-semibold text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}>
          {due ? 'Check the supplier again' : `check again ${shortDate(flag.checkAgainOn)}`}
        </span>
      )}
    </span>
  );
}
