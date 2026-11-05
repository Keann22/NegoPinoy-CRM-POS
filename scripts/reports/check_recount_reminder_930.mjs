import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sendTelegram(text) {
  if (!botToken || !chatId) {
    console.error('Telegram bot credentials not configured');
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    console.error('Telegram send failed:', data);
    return false;
  }
  return true;
}

async function main() {
  const isSend = process.argv.includes('--send');
  const now = new Date();
  const timeLabel = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(now);
  console.log(`Checking open recount batches at ${timeLabel} (send=${isSend})...`);

  const { data: openRows, error } = await supabase
    .from('recount_requests')
    .select('id, batch_id, message, status, due_date, products(name)')
    .eq('status', 'open');

  if (error) {
    console.error('Supabase query error:', error);
    process.exit(1);
  }

  if (!openRows || openRows.length === 0) {
    console.log('No open recount requests! All completed.');
    return;
  }

  console.log(`Found ${openRows.length} open item(s).`);
  const byBatch = new Map();
  openRows.forEach((r) => {
    const list = byBatch.get(r.batch_id) || [];
    list.push(r);
    byBatch.set(r.batch_id, list);
  });

  for (const [batchId, rows] of byBatch.entries()) {
    const pNames = rows.map((r) => (Array.isArray(r.products) ? r.products[0] : r.products)?.name || 'Item');
    const msg = [
      `<b>⏰ Paalala (9:30 AM): Hindi pa tapos nina Jas at Al ang pagsusuri/pabilang</b>`,
      `"${rows[0].message}"`,
      '',
      `May natitirang ${rows.length} item(s) na hindi pa tapos:`,
      ...pNames.map((n) => `• ${n}`),
      '',
      `Makikita pa rin ito sa kanilang screen/pop-up hanggang masuri at mai-save lahat.`
    ].join('\n');

    console.log('Message preview:\n', msg);
    if (isSend) {
      const ok = await sendTelegram(msg);
      console.log(`Batch ${batchId} reminder sent: ${ok}`);
    }
  }
}

main().catch(console.error);
