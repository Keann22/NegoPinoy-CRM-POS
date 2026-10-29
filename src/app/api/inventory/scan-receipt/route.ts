import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readReceiptImage, buildCandidates, matchLine, shortlistFor } from '@/lib/receipt-matching';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const { imageBase64, supplierId, tableItems } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 });
    }

    // 1. Read the receipt into line items.
    const { engine, lines } = await readReceiptImage(imageBase64);
    console.log(`[ScanReceipt] Read ${lines.length} line(s) via ${engine}`);

    // 2. The supplier-scoped products to match against.
    const { candidates, codeByProduct } = await buildCandidates(supabase, supplierId, tableItems);

    // 3. Match each line; unsure lines get a shortlist to pick from.
    const results = [];
    for (const line of lines) {
      const match = matchLine(line, candidates);
      const shortlist = match ? [] : await shortlistFor(supabase, line, candidates, codeByProduct);
      results.push({
        rawText: line.rawText,
        qty: line.qty,
        unitCost: line.unitCost,
        code: line.code,
        match,
        candidates: shortlist,
      });
    }

    return NextResponse.json({
      success: true,
      engine,
      lineCount: results.length,
      lines: results,
    });
  } catch (error: any) {
    console.error('[ScanReceipt] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to scan receipt' }, { status: 500 });
  }
}
