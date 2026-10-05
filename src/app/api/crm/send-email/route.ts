import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer, { type Transporter } from 'nodemailer';
import type {
  CrmEmailRecipient,
  SendEmailRequestPayload,
  SendEmailResponse,
  SendEmailResultItem,
  EmailDeliveryMode,
} from '@/types/crm-email.types';

export const dynamic = 'force-dynamic';

function renderHtmlTemplate(content: string, recipientName: string): string {
  const formattedContent = content
    .split('\n\n')
    .map((paragraph) => `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #374151;">${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NegoPinoy Message</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <div style="background-color: #0f172a; padding: 24px 32px; text-align: left;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">
              NegoPinoy <span style="color: #f59e0b; font-weight: 400;">CRM</span>
            </h1>
            <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">Negosyanteng Pinoy Store Notification</p>
          </div>
          <!-- Body -->
          <div style="padding: 32px; font-size: 15px;">
            ${formattedContent}
          </div>
          <!-- Footer -->
          <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748b;">
            <p style="margin: 0 0 4px 0;">This email was sent to <strong>${recipientName}</strong> by NegoPinoy.</p>
            <p style="margin: 0;">If you have any questions, reply to this email or contact our support team.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function personalize(text: string, recipient: CrmEmailRecipient): string {
  return text
    .replace(/\{\{name\}\}/gi, recipient.name || 'Valued Customer')
    .replace(/\{\{tier\}\}/gi, recipient.sukiTier || 'Customer')
    .replace(/\{\{email\}\}/gi, recipient.email || '');
}

export async function POST(req: Request) {
  try {
    const body: SendEmailRequestPayload = await req.json();
    const { recipients, subject, body: rawBody } = body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'At least one recipient is required.' },
        { status: 400 }
      );
    }

    if (!subject?.trim() || !rawBody?.trim()) {
      return NextResponse.json(
        { error: 'Subject and body cannot be empty.' },
        { status: 400 }
      );
    }

    // 1. Resend credentials check
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'NegoPinoy <onboarding@resend.dev>';

    // 2. SMTP (Namecheap / custom SMTP) credentials check
    const smtpUser = process.env.SMTP_USER?.trim() || process.env.NAMECHEAP_EMAIL?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim() || process.env.NAMECHEAP_PASSWORD?.trim();
    const smtpHost = process.env.SMTP_HOST?.trim() || 'mail.privateemail.com';
    const smtpPort = Number(process.env.SMTP_PORT?.trim() || 465);
    const smtpFrom = process.env.SMTP_FROM?.trim() || `NegoPinoy CRM <${smtpUser}>`;

    // Determine delivery mode priority: Resend > SMTP > Simulation
    let deliveryMode: EmailDeliveryMode = 'simulated';
    if (resendApiKey) {
      deliveryMode = 'resend';
    } else if (smtpUser && smtpPass) {
      deliveryMode = 'smtp';
    }

    let smtpTransporter: Transporter | null = null;
    if (deliveryMode === 'smtp') {
      smtpTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // true for 465 SSL, false for 587 TLS
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const results: SendEmailResultItem[] = [];
    const logInserts = [];

    const isValidUuid = (str?: string | null) =>
      Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

    for (const recipient of recipients) {
      const personalizedSubject = personalize(subject, recipient);
      const personalizedBody = personalize(rawBody, recipient);
      const html = renderHtmlTemplate(personalizedBody, recipient.name);
      const customerId = isValidUuid(recipient.id) ? recipient.id : null;

      if (deliveryMode === 'resend') {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: resendFromEmail,
              to: [recipient.email],
              subject: personalizedSubject,
              html,
            }),
          });

          const data = await res.json();
          if (res.ok) {
            results.push({
              email: recipient.email,
              name: recipient.name,
              success: true,
              status: 'sent',
            });
            logInserts.push({
              customer_id: customerId,
              recipient_email: recipient.email,
              recipient_name: recipient.name,
              subject: personalizedSubject,
              body: personalizedBody,
              status: 'sent',
              mode: 'resend',
            });
          } else {
            const errDetail = data?.message || 'Failed to send via Resend';
            results.push({
              email: recipient.email,
              name: recipient.name,
              success: false,
              status: 'failed',
              error: errDetail,
            });
            logInserts.push({
              customer_id: customerId,
              recipient_email: recipient.email,
              recipient_name: recipient.name,
              subject: personalizedSubject,
              body: personalizedBody,
              status: 'failed',
              mode: 'resend',
              error_message: errDetail,
            });
          }
        } catch (fetchErr: unknown) {
          const errMsg = fetchErr instanceof Error ? fetchErr.message : 'Network error';
          results.push({
            email: recipient.email,
            name: recipient.name,
            success: false,
            status: 'failed',
            error: errMsg,
          });
          logInserts.push({
            customer_id: customerId,
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            subject: personalizedSubject,
            body: personalizedBody,
            status: 'failed',
            mode: 'resend',
            error_message: errMsg,
          });
        }
      } else if (deliveryMode === 'smtp' && smtpTransporter) {
        try {
          await smtpTransporter.sendMail({
            from: smtpFrom,
            to: recipient.email,
            subject: personalizedSubject,
            text: personalizedBody,
            html,
          });

          results.push({
            email: recipient.email,
            name: recipient.name,
            success: true,
            status: 'sent',
          });
          logInserts.push({
            customer_id: customerId,
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            subject: personalizedSubject,
            body: personalizedBody,
            status: 'sent',
            mode: 'smtp',
          });
        } catch (smtpErr: unknown) {
          const errMsg = smtpErr instanceof Error ? smtpErr.message : 'SMTP send error';
          results.push({
            email: recipient.email,
            name: recipient.name,
            success: false,
            status: 'failed',
            error: errMsg,
          });
          logInserts.push({
            customer_id: customerId,
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            subject: personalizedSubject,
            body: personalizedBody,
            status: 'failed',
            mode: 'smtp',
            error_message: errMsg,
          });
        }
      } else {
        // Simulation mode
        results.push({
          email: recipient.email,
          name: recipient.name,
          success: true,
          status: 'simulated',
        });
        logInserts.push({
          customer_id: customerId,
          recipient_email: recipient.email,
          recipient_name: recipient.name,
          subject: personalizedSubject,
          body: personalizedBody,
          status: 'simulated',
          mode: 'simulated',
        });
      }
    }

    if (logInserts.length > 0) {
      const { error: logErr } = await supabase.from('customer_email_logs').insert(logInserts);
      if (logErr) {
        console.error('Failed to write customer_email_logs:', logErr);
      }
    }

    const sentCount = results.filter((r) => r.success).length;

    let successMessage = '';
    if (deliveryMode === 'resend') {
      successMessage = `Successfully sent ${sentCount} of ${recipients.length} email(s) via Resend.`;
    } else if (deliveryMode === 'smtp') {
      successMessage = `Successfully sent ${sentCount} of ${recipients.length} email(s) via Namecheap SMTP (${smtpUser}).`;
    } else {
      successMessage = `[SIMULATION] Simulated delivery for ${sentCount} recipient(s). (Add SMTP_USER & SMTP_PASS in .env.local to send live emails).`;
    }

    const responsePayload: SendEmailResponse = {
      success: sentCount > 0,
      mode: deliveryMode,
      sentCount,
      totalRequested: recipients.length,
      results,
      message: successMessage,
    };

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('CRM email sender route error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
