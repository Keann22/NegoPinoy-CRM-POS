import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use Node.js runtime so we can use pdfjs-dist
export const runtime = 'nodejs';

// Vercel serverless polyfills for browser-only globals that pdf.js expects
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix { constructor() {} } as any;
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D { constructor() {} } as any;
}

/**
 * pdfjs-dist's getTextContent() returns individually positioned text
 * fragments, not visual rows - naively joining every item on a page with a
 * single space collapses the entire page (every transaction row) into one
 * giant string, so a reference-number match and an unrelated amount
 * elsewhere on the page can look like they're "on the same line." Group
 * items by Y position (row) and sort left-to-right within each row to
 * reconstruct actual table rows, so ref/amount matching is scoped to a
 * single real transaction.
 */
function extractRows(items: any[]): string[] {
  const Y_TOLERANCE = 2;
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];

  for (const item of items) {
    const y = item.transform[5];
    const x = item.transform[4];
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str: item.str });
  }

  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob;
    const password = formData.get('password') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    
    // Force Vercel's Node File Trace (NFT) to bundle the worker file
    require('pdfjs-dist/legacy/build/pdf.worker.js');
    
    // Use the native pdfjs-dist library which properly supports password decryption
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js';
    
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      password: password || undefined,
    });

    const pdfDocument = await loadingTask.promise;
    
    let lines: string[] = [];
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      lines = lines.concat(extractRows(textContent.items));
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: pendingPayments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('status', 'Pending');

    if (error) throw error;

    // A single real transfer can legitimately be split across multiple payment
    // rows (e.g. applied toward two different lay-away orders), each correctly
    // tagged with the same real reference number. Checking each row against
    // the full transaction amount individually means a legitimate split
    // payment can never match. Group by reference number and compare the
    // group's summed amount instead. A small tolerance accounts for minor
    // OCR misreads on the amount digits (observed real matches differ by at
    // most ~P2; observed wrong reference-number collisions differ by P60+,
    // so there's a wide, safe gap to pick a threshold from).
    const AMOUNT_TOLERANCE = 5;

    const groups = new Map<string, typeof pendingPayments>();
    for (const payment of pendingPayments) {
      if (!payment.reference_number || !payment.amount) continue;

      // Extract only the digits from the reference number to ignore appended dates (e.g., '2041638342110Jun08' -> '2041638342110')
      const digitsMatch = payment.reference_number.match(/\d{8,}/);
      if (!digitsMatch) continue;
      const refClean = digitsMatch[0];
      if (refClean.length <= 5) continue;

      if (!groups.has(refClean)) groups.set(refClean, []);
      groups.get(refClean)!.push(payment);
    }

    let verifiedCount = 0;

    for (const [refClean, payments] of groups) {
      const matchingRow = lines.find((line) => line.replace(/\s/g, '').includes(refClean));
      if (!matchingRow) continue;

      const tokens = matchingRow.split(/\s+/);
      const refIdx = tokens.findIndex((t) => t.replace(/\D/g, '') === refClean);
      const rowAmountStr = refIdx !== -1 ? tokens[refIdx + 1] : undefined;
      const rowAmount = rowAmountStr ? parseFloat(rowAmountStr.replace(/,/g, '')) : NaN;
      if (isNaN(rowAmount)) continue;

      const sum = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      if (Math.abs(sum - rowAmount) > AMOUNT_TOLERANCE) continue;

      for (const payment of payments) {
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
