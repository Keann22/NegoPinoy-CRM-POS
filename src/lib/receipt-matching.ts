import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runGeminiReceipt,
  runTesseractBase64,
  runGoogleVisionBase64,
  parseReceiptLines,
  tokenScore,
  longestToken,
  type ParsedReceiptLine,
} from '@/lib/receipt-ocr';

// Shared by Scan Receipt (Procurement Sheet) and Snap receipt.

// Below this token-overlap score a line is treated as "unsure" and the user
// is asked to pick from a shortlist instead of trusting the guess.
export const MATCH_THRESHOLD = 0.34;

export type Candidate = {
  productId: string;
  productName: string;
  sku: string | null;
  existingCode: string | null;
};

export type LineMatch = Candidate & { matchedBy: string; confidence: number };

/**
 * Read a receipt photo into line items. Gemini vision is the primary reader:
 * it returns already-structured items and handles hard/handwritten receipts
 * that flat OCR can't. Only if it's unavailable or reads nothing (no key,
 * quota, network) do we fall back to free Tesseract OCR, then Google Vision
 * when Tesseract's text is too thin.
 */
export async function readReceiptImage(imageBase64: string): Promise<{ engine: string; lines: ParsedReceiptLine[] }> {
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
  return { engine, lines };
}

/**
 * The products a receipt line is matched against: items on the procurement
 * table for this supplier, plus everything the supplier is priced for (with
 * their stored supplier code).
 */
export async function buildCandidates(
  supabase: SupabaseClient,
  supplierId: string | null | undefined,
  tableItems?: { productId: string; productName?: string }[]
): Promise<{ candidates: Candidate[]; codeByProduct: Map<string, string | null> }> {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const codeByProduct = new Map<string, string | null>();

  for (const it of tableItems || []) {
    if (it?.productId && !seen.has(it.productId)) {
      seen.add(it.productId);
      candidates.push({ productId: it.productId, productName: it.productName || '', sku: null, existingCode: null });
    }
  }

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
        const existing = candidates.find((c) => c.productId === p.id);
        if (existing) existing.existingCode = existingCode;
      }
    }
  }

  return { candidates, codeByProduct };
}

/** Exact supplier code first, then the best name overlap above `threshold`. */
export function matchLine(line: ParsedReceiptLine, candidates: Candidate[], threshold = MATCH_THRESHOLD): LineMatch | null {
  if (line.code) {
    const codeHit = candidates.find(
      (c) => c.existingCode && c.existingCode.toUpperCase() === line.code!.toUpperCase()
    );
    if (codeHit) return { ...codeHit, matchedBy: 'code', confidence: 1 };
  }

  if (line.description) {
    let best: Candidate | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const score = tokenScore(line.description, c.productName);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && bestScore >= threshold) {
      return { ...best, matchedBy: 'name', confidence: Number(bestScore.toFixed(2)) };
    }
  }
  return null;
}

/** Up to five likely products for an unsure line, widening to a name search. */
export async function shortlistFor(
  supabase: SupabaseClient,
  line: ParsedReceiptLine,
  candidates: Candidate[],
  codeByProduct: Map<string, string | null>
): Promise<Candidate[]> {
  const shortlist = candidates
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
          shortlist.push({ productId: p.id, productName: p.name, sku: p.sku ?? null, existingCode: codeByProduct.get(p.id) ?? null });
        }
      }
    }
  }
  return shortlist;
}
