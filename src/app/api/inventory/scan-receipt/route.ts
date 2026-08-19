import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  runGeminiReceipt,
  runTesseractBase64,
  runGoogleVisionBase64,
  parseReceiptLines,
  tokenScore,
  longestToken,
  type ParsedReceiptLine,
} from '@/lib/receipt-ocr';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Below this token-overlap score a line is treated as "unsure" and the user
// is asked to pick from a shortlist instead of trusting the guess.
const MATCH_THRESHOLD = 0.34;

type Candidate = {
  productId: string;
  productName: string;
  sku: string | null;
  existingCode: string | null;
};

export async function POST(request: Request) {
  try {
    const { imageBase64, supplierId, tableItems } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 });
    }

    // 1. Read the receipt into line items. Gemini vision is the primary reader:
    //    it returns already-structured items and handles hard/handwritten
    //    receipts that flat OCR can't. Only if it's unavailable or reads nothing
    //    (no key, quota, network) do we fall back automatically to the free
    //    Tesseract OCR, then Google Vision when Tesseract's text is too thin.
    let engine = 'gemini';
    let lines: ParsedReceiptLine[] = (await runGeminiReceipt(imageBase64)) || [];

    if (lines.length === 0) {
      engine = 'tesseract';
      const text = await runTesseractBase64(imageBase64);
      lines = parseReceiptLines(text);
      if (lines.length < 2) {
        const visionText = await runGoogleVisionBase64(imageBase64);
        if (visionText) {
          const visionLines = parseReceiptLines(visionText);
          if (visionLines.length > lines.length) {
            engine = 'vision';
            lines = visionLines;
          }
        }
      }
    }
    console.log(`[ScanReceipt] Read ${lines.length} line(s) via ${engine}`);

    // 2. Build the supplier-scoped candidate set.
    //    (a) items currently on the procurement table for this supplier.
    const candidates: Candidate[] = [];
    const seen = new Set<string>();

    const codeByProduct = new Map<string, string | null>();

    if (Array.isArray(tableItems)) {
      for (const it of tableItems) {
        if (it?.productId && !seen.has(it.productId)) {
          seen.add(it.productId);
          candidates.push({ productId: it.productId, productName: it.productName || '', sku: null, existingCode: null });
        }
      }
    }

    //    (b) all products this supplier is priced for, carrying their stored
    //        supplier code (used both for exact-code matching and as fallback
    //        name candidates).
    if (supplierId) {
      const { data: supplierProducts } = await supabase
        .from('products')
        .select('id, name, sku, supplier_pricing')
        .contains('supplier_pricing', [{ supplierId }]);

      for (const p of supplierProducts || []) {
        const entry = (p.supplier_pricing || []).find((sp: any) => sp.supplierId === supplierId);
        const existingCode: string | null = entry?.supplierCode || null;
        codeByProduct.set(p.id, existingCode);
        if (!seen.has(p.id)) {
          seen.add(p.id);
          candidates.push({ productId: p.id, productName: p.name, sku: p.sku ?? null, existingCode });
        } else {
          // enrich the table-item candidate with its stored code
          const existing = candidates.find((c) => c.productId === p.id);
          if (existing) existing.existingCode = existingCode;
        }
      }
    }

    // 3. Match each parsed line through the cascade.
    const results = [];
    for (const line of lines) {
      let match: (Candidate & { matchedBy: string; confidence: number }) | null = null;

      // (a) exact supplier-code match
      if (line.code) {
        const codeHit = candidates.find(
          (c) => c.existingCode && c.existingCode.toUpperCase() === line.code!.toUpperCase()
        );
        if (codeHit) match = { ...codeHit, matchedBy: 'code', confidence: 1 };
      }

      // (b/c) fuzzy name match against the supplier-scoped candidates
      if (!match && line.description) {
        let best: Candidate | null = null;
        let bestScore = 0;
        for (const c of candidates) {
          const score = tokenScore(line.description, c.productName);
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (best && bestScore >= MATCH_THRESHOLD) {
          match = { ...best, matchedBy: 'name', confidence: Number(bestScore.toFixed(2)) };
        }
      }

      // (d) unsure → build a shortlist. Rank supplier candidates, and if none
      //     are close, widen with a broad name search on the longest token.
      let shortlist: Candidate[] = [];
      if (!match) {
        shortlist = candidates
          .map((c) => ({ c, score: tokenScore(line.description, c.productName) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .filter((x) => x.score > 0)
          .map((x) => x.c);

        if (shortlist.length < 5) {
          const token = longestToken(line.description);
          if (token) {
            const { data: broad } = await supabase
              .from('products')
              .select('id, name, sku')
              .ilike('name', `%${token}%`)
              .not('name', 'ilike', '[DELETED]%')
              .limit(5);
            for (const p of broad || []) {
              if (!shortlist.some((s) => s.productId === p.id)) {
                shortlist.push({
                  productId: p.id,
                  productName: p.name,
                  sku: p.sku ?? null,
                  existingCode: codeByProduct.get(p.id) ?? null,
                });
              }
            }
          }
        }
      }

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
