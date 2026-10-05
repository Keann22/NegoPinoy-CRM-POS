import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export const dynamic = 'force-dynamic';

export async function POST() {
  const host = process.env.IMAP_HOST?.trim() || process.env.SMTP_HOST?.trim() || 'mail.privateemail.com';
  const port = Number(process.env.IMAP_PORT?.trim() || 993);
  const user = process.env.IMAP_USER?.trim() || process.env.SMTP_USER?.trim() || process.env.NAMECHEAP_EMAIL?.trim();
  const pass = process.env.IMAP_PASS?.trim() || process.env.SMTP_PASS?.trim() || process.env.NAMECHEAP_PASSWORD?.trim();

  if (!user || !pass) {
    return NextResponse.json({
      success: false,
      syncedCount: 0,
      message: 'IMAP credentials missing. Please configure SMTP_USER & SMTP_PASS in .env.local',
    });
  }

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: {
      user,
      pass,
    },
    logger: false,
  });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  let syncedCount = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Fetch unseen or recent messages
      const messages = client.fetch({ seen: false }, { source: true, envelope: true, uid: true });

      // Fetch all customer emails to map customer_id
      const { data: customerRows } = await supabase
        .from('customers')
        .select('id, full_name, email')
        .not('email', 'is', null)
        .neq('email', '');

      const customerMap = new Map<string, { id: string; name: string }>();
      (customerRows || []).forEach((c) => {
        if (c.email) customerMap.set(c.email.trim().toLowerCase(), { id: c.id, name: c.full_name || 'Customer' });
      });

      const inserts = [];

      for await (const message of messages) {
        if (!message.source) continue;

        const parsed = await simpleParser(message.source);
        const fromAddress = parsed.from?.value?.[0]?.address?.trim().toLowerCase() || '';
        const fromName = parsed.from?.value?.[0]?.name || parsed.from?.text || 'Customer';

        if (!fromAddress) continue;

        // Skip emails originating from ourselves
        if (fromAddress === user.toLowerCase()) continue;

        const matchedCust = customerMap.get(fromAddress);
        const customerId = matchedCust ? matchedCust.id : null;
        const recipientName = matchedCust ? matchedCust.name : fromName;

        const subject = parsed.subject || '(No Subject)';
        const bodyText = (parsed.text || parsed.html || '').trim();
        const dateIso = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();
        const messageId = parsed.messageId || null;
        const inReplyTo = parsed.inReplyTo || null;

        // Check if message_id already exists to prevent duplicate inserts
        if (messageId) {
          const { data: existing } = await supabase
            .from('customer_email_logs')
            .select('id')
            .eq('message_id', messageId)
            .maybeSingle();

          if (existing) continue;
        }

        inserts.push({
          customer_id: customerId,
          recipient_email: fromAddress,
          recipient_name: recipientName,
          subject,
          body: bodyText,
          status: 'received',
          mode: 'imap',
          direction: 'inbound',
          message_id: messageId,
          in_reply_to: inReplyTo,
          created_at: dateIso,
        });

        syncedCount++;
      }

      if (inserts.length > 0) {
        const { error: insertErr } = await supabase.from('customer_email_logs').insert(inserts);
        if (insertErr) {
          console.error('Error inserting synced inbound emails:', insertErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();

    return NextResponse.json({
      success: true,
      syncedCount,
      message: syncedCount > 0
        ? `Successfully synced ${syncedCount} new customer email reply(s).`
        : 'Inbox is up to date. No new customer replies found.',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to connect via IMAP';
    console.error('Inbound IMAP sync error:', err);

    return NextResponse.json(
      {
        success: false,
        syncedCount: 0,
        message: `IMAP Sync Error: ${errorMsg}`,
      },
      { status: 500 }
    );
  }
}
