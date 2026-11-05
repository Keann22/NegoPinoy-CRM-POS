const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface InstallmentPlanCheckProps {
  /** The order's price: items − discount + insurance + shipping. The installment total. */
  price: number;
  alreadyPaid: number;
  downpayment: number;
  months: number;
  monthly: number;
}

/**
 * Edit Payment Terms: shows whether the installment plan adds up to the order's price.
 * Installment has no interest, so the total is always the price (fixed 2026-11-05 after
 * #9BD7150, where money paid before the terms was counted on top of the plan).
 */
export function InstallmentPlanCheck({ price, alreadyPaid, downpayment, months, monthly }: InstallmentPlanCheckProps) {
  if (!(months > 0) || !(monthly > 0)) return null;
  const planTotal = alreadyPaid + downpayment + months * monthly;
  const diff = Math.round((planTotal - price) * 100) / 100;
  const left = Math.max(0, price - alreadyPaid - downpayment);
  const fairMonthly = Math.ceil(left / months);
  const fits = Math.abs(diff) <= months; // a peso or so per month is just rounding

  return (
    <div
      className={`space-y-1 rounded-md border p-3 text-xs ${
        fits
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
          : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
      }`}
    >
      <p>
        Price <b>{peso(price)}</b>. Plan: {alreadyPaid > 0 && <>already paid {peso(alreadyPaid)} + </>}
        downpayment {peso(downpayment)} + {months} × {peso(monthly)} = <b>{peso(planTotal)}</b>
      </p>
      {fits ? (
        <p className="font-medium">✓ The plan covers the price.</p>
      ) : (
        <p className="font-medium">
          The plan is {peso(Math.abs(diff))} {diff > 0 ? 'more' : 'less'} than the price. The order total stays{' '}
          {peso(price)}, so the customer owes {peso(left)} after the downpayment: about {peso(fairMonthly)} a month.
        </p>
      )}
    </div>
  );
}
