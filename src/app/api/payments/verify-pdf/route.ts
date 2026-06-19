import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';

// Use Node.js runtime so we can use pdfjs-dist
export const runtime = 'nodejs';

// Vercel serverless polyfills for browser-only globals that pdf.js expects
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix { constructor() {} } as any;
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D { constructor() {} } as any;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob;
    const password = formData.get('password') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // pdf-parse expects a buffer
    const buffer = Buffer.from(arrayBuffer);
    
    const pdfParse = (await import('pdf-parse')).default || require('pdf-parse');
    
    // Handle password protected PDFs
    const options = password ? { password } as any : undefined;
    
    const parsedData = await pdfParse(buffer, options);
    const fullText = parsedData.text;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: pendingPayments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('status', 'Pending');

    if (error) throw error;

    let verifiedCount = 0;
    const lines = fullText.split('\n');

    for (const payment of pendingPayments) {
      if (!payment.reference_number || !payment.amount) continue;

      // Extract only the digits from the reference number to ignore appended dates (e.g., '2041638342110Jun08' -> '2041638342110')
      const digitsMatch = payment.reference_number.match(/\d{8,}/);
      if (!digitsMatch) continue;
      const refClean = digitsMatch[0];
      const amountClean = Number(payment.amount).toFixed(2);
      const amountString = payment.amount.toString();

      let isMatch = false;
      
      for (const line of lines) {
        const noSpaceLine = line.replace(/\s/g, '');
        // Check if line has the reference number
        if (refClean.length > 5 && noSpaceLine.includes(refClean)) {
          // Check if line also has the amount
          if (line.includes(amountClean) || line.includes(amountString)) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        await supabase
          .from('payments')
          .update({ status: 'Verified' })
          .eq('id', payment.id);
        verifiedCount++;
      }
    }

    return NextResponse.json({ success: true, verifiedCount });

  } catch (error: any) {
    console.error('PDF verification error:', error);
    // If it's a password error, return a specific message
    if (error.name === 'PasswordException') {
      return NextResponse.json({ error: 'Incorrect or missing password for PDF.' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Failed to parse PDF or verify payments.' }, { status: 500 });
  }
}
