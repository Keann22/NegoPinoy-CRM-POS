import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { extractReceiptDateTime } from '../../src/lib/services/payments/payment-date-ocr';
import { extractGcashRefFromNotes, isOwnPhoneNumberRef } from '../../src/lib/services/payments/payment-ref-utils';

dotenv.config({ path: '.env.local' });

interface PendingRow {
  id: string;
  order_id: string | null;
  proof_url: string;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  ocr_amount: number | null;
  ocr_payment_date: string | null;
  notes: string | null;
  orders: { status: string | null } | { status: string | null }[] | null;
}

function extractRef(text: string): string | null {
  const labelIdx = text.search(/ref\.?\s*no\.?/i);
  if (labelIdx !== -1) {
    const win = text.slice(labelIdx, labelIdx + 150).replace(
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s*\d{1,2},?\s*\d{4}(?:\s*\d{1,2}:\d{2}\s*(?:am|pm)?)?/gi,
      ' ',
    );
    const digits = win.replace(/\D/g, '');
    if (digits.length >= 13 && !isOwnPhoneNumberRef(digits.slice(0, 13))) return digits.slice(0, 13);
  }
  for (const m of text.replace(/[\s\-]/g, '').matchAll(/\d{13}/g)) {
    if (!isOwnPhoneNumberRef(m[0])) return m[0];
  }
  return null;
}

function extractAmt(text: string): number | null {
  const amounts: number[] = [];
  for (const m of text.matchAll(/(?:Amount|PHP|P|₱|Php)\s*([0-9,]+\.\d{2})/gi)) {
    amounts.push(parseFloat(m[1].replace(/,/g, '')));
  }
  for (const m of text.matchAll(/([0-9,]+\.\d{2})/g)) {
    amounts.push(parseFloat(m[1].replace(/,/g, '')));
  }
  return amounts.length ? Math.max(...amounts) : null;
}

async function visionBatch(urls: string[], apiKey: string): Promise<(string | null)[]> {
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: urls.map((imageUri) => ({
        image: { source: { imageUri } },
        features: [{ type: 'TEXT_DETECTION' }],
      })),
    }),
  });
  const data = (await res.json()) as {
    responses?: { textAnnotations?: { description?: string }[]; error?: { message?: string } }[];
  };
  if (!res.ok) throw new Error(`Vision API ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return (data.responses || []).map((r) => r.textAnnotations?.[0]?.description || null);
}

async function main() {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY missing in .env.local');

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const rows: PendingRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, order_id, proof_url, payment_date, payment_method, reference_number, ocr_amount, ocr_payment_date, notes, orders(status)')
      .eq('status', 'Pending')
      .not('proof_url', 'is', null)
      .neq('proof_url', '')
      .neq('payment_method', 'SPX COD Remittance')
      .is('ocr_payment_date', null)
      .order('payment_date', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    const chunk = (data || []) as PendingRow[];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }

  const targets = rows.filter((r) => {
    const ord = Array.isArray(r.orders) ? r.orders[0] : r.orders;
    if (ord?.status === 'Cancelled') return false;
    return !['Cash', 'COD Payed', 'Shopee Platform Payouts'].includes(r.payment_method);
  });

  console.log(`Found ${targets.length} pending payments missing ocr_payment_date.`);

  let updatedDates = 0;
  let updatedTimes = 0;
  let updatedRefs = 0;
  let updatedAmts = 0;
  let noText = 0;

  const BATCH = 16;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const texts = await visionBatch(batch.map((b) => b.proof_url), apiKey);

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const text = texts[j];
      if (!text) {
        noText++;
        continue;
      }

      const dt = extractReceiptDateTime(text, row.payment_date);
      const upd: Record<string, unknown> = {};
      if (dt.date) {
        upd.ocr_payment_date = dt.date;
        updatedDates++;
      }
      if (dt.time) {
        upd.ocr_payment_time = dt.time;
        updatedTimes++;
      }
      if (!row.reference_number || !row.reference_number.trim()) {
        const ref = extractRef(text) || extractGcashRefFromNotes(row.notes);
        if (ref) {
          upd.reference_number = ref;
          updatedRefs++;
        }
      }
      if (row.ocr_amount === null) {
        const amt = extractAmt(text);
        if (amt !== null) {
          upd.ocr_amount = amt;
          updatedAmts++;
        }
      }

      if (Object.keys(upd).length > 0) {
        const { error } = await supabase.from('payments').update(upd).eq('id', row.id);
        if (error) console.error(`Failed update ${row.id}:`, error.message);
      }
    }

    if ((i + BATCH) % 160 === 0 || i + BATCH >= targets.length) {
      console.log(`Processed ${Math.min(i + BATCH, targets.length)}/${targets.length} | dates=${updatedDates} times=${updatedTimes} refs=${updatedRefs} amts=${updatedAmts} noText=${noText}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
