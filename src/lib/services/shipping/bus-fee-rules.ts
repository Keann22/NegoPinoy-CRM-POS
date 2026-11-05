/**
 * Bus shipping money rules (owner, 2026-11-05). Pure functions, used by the
 * screen (to show the result before saving) and by the save on the server.
 */
import type { BusEstimate, BusFeeShare, BusSfResult, BusTrip } from '@/types/bus-shipping.types';

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const busTrackingText = (company: string, destination: string) =>
  `BUS: ${company.trim().toUpperCase()} — ${destination.trim().toUpperCase()}`;

interface ShareOrder {
  id: string;
  itemValue: number;
  advance: number;
}

/**
 * How one trip fee goes on the orders by default. Orders where the customer
 * already sent SF take the fee first (up to what they sent), so their balances
 * come out right; the rest is split by item value, since the bus charges by value
 * and weight. Staff can change every share.
 */
export function defaultShares(orders: ShareOrder[], fee: number): BusFeeShare[] {
  const shares = new Map(orders.map((o) => [o.id, 0]));
  let left = round2(Math.max(0, fee));
  for (const o of orders) {
    const take = round2(Math.min(left, Math.max(0, o.advance)));
    shares.set(o.id, take);
    left = round2(left - take);
  }
  if (left > 0 && orders.length > 0) {
    const totalValue = orders.reduce((s, o) => s + Math.max(0, o.itemValue), 0);
    let given = 0;
    orders.forEach((o, i) => {
      const part = i === orders.length - 1
        ? round2(left - given)
        : round2(totalValue > 0 ? (left * Math.max(0, o.itemValue)) / totalValue : left / orders.length);
      given = round2(given + part);
      shares.set(o.id, round2((shares.get(o.id) || 0) + part));
    });
  }
  return orders.map((o) => ({ orderId: o.id, amount: shares.get(o.id) || 0 }));
}

/**
 * Whether the customer owes more SF or sent extra, across the whole trip.
 * Advance SF was paid above the items; Log Payment turns that into store credit,
 * so the part now used for the SF is taken back from store credit.
 */
export function busSfResult(
  orders: { advance: number }[],
  shares: BusFeeShare[],
  storeCredit: number,
  freeShipping: boolean,
): BusSfResult {
  const charged = freeShipping ? 0 : round2(shares.reduce((s, x) => s + Math.max(0, x.amount), 0));
  const advance = round2(orders.reduce((s, o) => s + Math.max(0, o.advance), 0));
  const covered = round2(Math.min(advance, charged));
  const creditUsed = round2(Math.min(covered, Math.max(0, storeCredit)));
  return {
    advance,
    creditUsed,
    creditShort: round2(covered - creditUsed),
    owed: round2(charged - covered),
    extra: round2(advance - covered),
  };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;
const phDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });

/** Straight line fee = a + b × kg through the trips (least squares); null if the weights don't spread. */
function fitByWeight(trips: { kg: number; fee: number }[]): { a: number; b: number } | null {
  const n = trips.length;
  const mx = trips.reduce((s, t) => s + t.kg, 0) / n;
  const my = trips.reduce((s, t) => s + t.fee, 0) / n;
  const sxx = trips.reduce((s, t) => s + (t.kg - mx) ** 2, 0);
  if (sxx < 1) return null;
  const b = trips.reduce((s, t) => s + (t.kg - mx) * (t.fee - my), 0) / sxx;
  if (b < 0) return null;
  return { a: Math.max(0, my - b * mx), b };
}

/**
 * A likely fee per bus company for one destination. Few trips are recorded at
 * first, so it stays simple and says how it was worked out:
 * 3+ weighed trips → a line through them; else the most similar trip, scaled by
 * weight; no weight → the usual (median) fee.
 */
export function estimateBusFees(trips: BusTrip[], destination: string, weightKg: number | null, value: number | null): BusEstimate[] {
  const dest = norm(destination);
  if (!dest) return [];
  const byCompany = new Map<string, BusTrip[]>();
  for (const t of trips) {
    if (norm(t.destination) !== dest) continue;
    const list = byCompany.get(t.busCompany) || [];
    list.push(t);
    byCompany.set(t.busCompany, list);
  }
  const out: BusEstimate[] = [];
  for (const [busCompany, list] of byCompany) {
    const sorted = [...list].sort((a, b) => b.shippedAt.localeCompare(a.shippedAt));
    const fees = sorted.map((t) => t.fee);
    const weighed = sorted.filter((t) => (t.weightKg || 0) > 0).map((t) => ({ kg: t.weightKg!, fee: t.fee, t }));
    let estimate: number | null = median(fees);
    let basis = `usual fee of ${sorted.length} trip${sorted.length === 1 ? '' : 's'}`;
    if (weightKg && weightKg > 0 && weighed.length > 0) {
      const line = weighed.length >= 3 ? fitByWeight(weighed) : null;
      if (line) {
        estimate = line.a + line.b * weightKg;
        basis = `from ${weighed.length} weighed trips (about ${peso(line.a)} + ${peso(line.b)}/kg)`;
      } else {
        // Most similar trip by weight (and value, when both are known).
        const dist = (x: { kg: number; t: BusTrip }) =>
          Math.abs(x.kg - weightKg) / weightKg +
          (value && x.t.declaredValue ? Math.abs(x.t.declaredValue - value) / value : 0);
        const near = [...weighed].sort((a, b) => dist(a) - dist(b))[0];
        estimate = (near.fee / near.kg) * weightKg;
        basis = `like the ${near.kg} kg trip on ${phDate(near.t.shippedAt)} (${peso(near.fee)})`;
      }
    }
    out.push({
      busCompany,
      trips: sorted.length,
      estimate: estimate == null ? null : Math.round(estimate),
      basis,
      lastFee: sorted[0].fee,
      lastDate: sorted[0].shippedAt,
      minFee: Math.min(...fees),
      maxFee: Math.max(...fees),
    });
  }
  return out.sort((a, b) => (a.estimate ?? Infinity) - (b.estimate ?? Infinity));
}
