'use client';

import type { UseFormRegister } from 'react-hook-form';

interface OverpaymentTipNoticeProps {
  extraAmount: number;
  isSplit: boolean;
  register: UseFormRegister<any>;
}

export function OverpaymentTipNotice({ extraAmount, isSplit, register }: OverpaymentTipNoticeProps) {
  if (extraAmount > 0.009) {
    return (
      <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1.5 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        <div className="font-semibold flex items-center gap-1.5">
          <span>💡</span>
          <span>Overpayment of ₱{extraAmount.toFixed(2)} detected</span>
        </div>
        <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
          By default, this excess is automatically saved to the customer's Store Credit.
        </p>
        <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground pt-1">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-emerald-500 accent-emerald-600"
            {...register("isTip")}
          />
          <span>This excess is a Tip / Keep the change (do not add store credit)</span>
        </label>
      </div>
    );
  }

  if (!isSplit && extraAmount <= 0.009) {
    return (
      <p className="text-[11px] text-muted-foreground mt-1">
        💡 Enter the exact amount from GCash. Any excess is automatically credited to the customer.
      </p>
    );
  }

  return null;
}
