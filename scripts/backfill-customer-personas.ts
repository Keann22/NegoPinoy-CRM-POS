/**
 * Backfill customer personas for all customers with at least one order.
 * Prioritizes customers who have a linked Messenger PSID and highest spend first.
 *
 * Usage:
 *   .\node_modules\.bin\tsx.cmd scripts\backfill-customer-personas.ts --limit=10 --concurrency=4
 *   .\node_modules\.bin\tsx.cmd scripts\backfill-customer-personas.ts --concurrency=6
 *   .\node_modules\.bin\tsx.cmd scripts\backfill-customer-personas.ts --retry-fallback --concurrency=3
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadSharedCatalogSnapshot } from '../src/lib/services/customers/customer-profile-context';
import { generateCustomerProfile } from '../src/lib/services/customers/customer-profile-service';

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

function argNumber(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split('=')[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const concurrency = Math.min(10, Math.max(1, Math.round(argNumber('concurrency', 6))));
  const limit = Math.max(0, Math.round(argNumber('limit', 0)));
  const retryFallback = process.argv.includes('--retry-fallback');

  const supabase = createClient(url, key);

  const targetIds: string[] = [];
  const seen = new Set<string>();

  if (retryFallback) {
    const { data: fbRows, error: fbErr } = await supabase
      .from('customer_profiles')
      .select('customer_id')
      .eq('model_used', 'heuristic-fallback')
      .order('source_order_count', { ascending: false })
      .limit(limit > 0 ? limit : 5000);
    if (fbErr) throw fbErr;
    for (const r of fbRows ?? []) {
      const id = String(r.customer_id);
      if (!seen.has(id)) {
        seen.add(id);
        targetIds.push(id);
      }
    }
  }

  if (limit === 0 || targetIds.length < limit) {
    const remaining = limit > 0 ? limit - targetIds.length : 5000;
    for (let from = 0; from < remaining; from += 1000) {
      const { data: rpcRows, error: rpcErr } = await supabase
        .rpc('get_unprofiled_order_customers', { p_limit: remaining })
        .range(from, Math.min(remaining - 1, from + 999));
      if (rpcErr) throw rpcErr;
      const chunk = (rpcRows ?? []) as Array<{ customer_id: string }>;
      for (const r of chunk) {
        const id = String(r.customer_id);
        if (!seen.has(id)) {
          seen.add(id);
          targetIds.push(id);
        }
      }
      if (chunk.length < 1000) break;
    }
  }

  const total = limit > 0 ? Math.min(limit, targetIds.length) : targetIds.length;
  const queue = targetIds.slice(0, total);
  console.log(`Starting customer persona backfill: total=${total}, concurrency=${concurrency}, retryFallback=${retryFallback}`);

  if (queue.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  let sharedCatalog = await loadSharedCatalogSnapshot(supabase);
  let cursor = 0;
  let done = 0;
  let gemini = 0;
  let fallback = 0;
  let failed = 0;
  const startedAt = Date.now();

  const logProgress = (force = false) => {
    if (!force && done % 25 !== 0 && done !== total) return;
    const elapsedSec = Math.max(0.1, (Date.now() - startedAt) / 1000);
    const rate = done / elapsedSec;
    const etaMin = rate > 0 ? ((total - done) / rate / 60).toFixed(1) : '?';
    console.log(
      `[${done}/${total}] gemini=${gemini} fallback=${fallback} failed=${failed} rate=${rate.toFixed(2)}/s eta=${etaMin}m`
    );
  };

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= queue.length) break;
      const customerId = queue[idx];
      if (idx > 0 && idx % 600 === 0) {
        sharedCatalog = await loadSharedCatalogSnapshot(supabase).catch(() => sharedCatalog);
      }
      try {
        const res = await generateCustomerProfile(supabase, { customerId }, sharedCatalog);
        if (res.profile?.modelUsed === 'heuristic-fallback') fallback++;
        else gemini++;
      } catch (err) {
        failed++;
        console.warn(`Backfill failed for ${customerId}:`, err instanceof Error ? err.message : String(err));
      } finally {
        done++;
        logProgress(false);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );

  logProgress(true);
  console.log('Backfill complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
