import { createWorker } from 'tesseract.js';

/**
 * Receipt OCR helpers for the Procurement "Scan Receipt" flow.
 *
 * These are a receipt-only copy of the payment-proof OCR in
 * `src/app/api/payments/extract-ocr/route.ts`, deliberately NOT shared with it.
 * The key difference: these accept the image as raw base64 content (a freshly
 * taken/uploaded photo) instead of a stored public URL, so no upload step is
 * needed before scanning.
 */

/** Strip a `data:<mime>;base64,` prefix if present, returning the raw base64. */
function stripDataUri(input: string): string {
  const comma = input.indexOf(',');
  if (input.startsWith('data:') && comma !== -1) return input.slice(comma + 1);
  return input;
}

export async function runTesseractBase64(imageBase64: string): Promise<string> {
  const buffer = Buffer.from(stripDataUri(imageBase64), 'base64');
  const worker = await createWorker('eng', undefined, {
    cachePath: '/tmp',
    cacheMethod: 'readWrite',
    logger: () => {},
  });
  try {
    const { data } = await worker.recognize(buffer);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

/**
 * Google Cloud Vision reads real-world photos (glare, angle, thermal print)
 * far better than Tesseract. It costs money per call, so it's only used as a
 * fallback when Tesseract's text is too thin to parse. Returns null (never
 * throws) on any failure so a missing/bad key can't take down the request.
 */
export async function runGoogleVisionBase64(imageBase64: string): Promise<string | null> {
  const visionApiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!visionApiKey) {
    console.warn('[ScanReceipt] Vision fallback skipped: GOOGLE_CLOUD_VISION_API_KEY is not set');
    return null;
  }

  try {
    const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: stripDataUri(imageBase64) },
            features: [{ type: 'TEXT_DETECTION' }],
          },
        ],
      }),
    });
    const visionData = await visionResponse.json();
    if (!visionResponse.ok) {
      console.warn('[ScanReceipt] Vision fallback failed:', visionData);
      return null;
    }
    return visionData.responses?.[0]?.textAnnotations?.[0]?.description || null;
  } catch (err) {
    console.warn('[ScanReceipt] Vision fallback threw:', err);
    return null;
  }
}

export interface ParsedReceiptLine {
  rawText: string;
  qty: number;
  unitCost: number;
  code: string | null;
  description: string;
}

/** Split a data URI into its mime type and raw base64 (defaults to image/jpeg). */
function splitDataUri(input: string): { mimeType: string; data: string } {
  const m = input.match(/^data:([^;]+);base64,(.*)$/s);
  if (m) return { mimeType: m[1], data: m[2] };
  return { mimeType: 'image/jpeg', data: input };
}

/**
 * Primary receipt reader: Gemini vision. Unlike flat OCR, it returns the
 * receipt already split into structured line items (code / name / qty / unit
 * cost), which is the hard part for messy, handwritten, or thermal receipts.
 *
 * Called via the plain Generative Language REST API (no Genkit — that path is
 * the stub that broke the old feature). Returns null on ANY failure (missing
 * key, quota, bad response) so the caller falls back to Tesseract + Vision.
 */
export async function runGeminiReceipt(imageBase64: string): Promise<ParsedReceiptLine[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[ScanReceipt] Gemini skipped: GEMINI_API_KEY is not set');
    return null;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const { mimeType, data } = splitDataUri(imageBase64);

  const promptText =
    'You are a meticulous data-entry assistant reading a supplier purchase receipt for a Philippine ' +
    'retail business. The receipt may be thermal-printed, photographed at an angle, or handwritten. ' +
    'Extract every PRODUCT line item. For each item return: "code" = the supplier\'s printed product ' +
    'code/SKU if any (else ""), "name" = the product name/description, "quantity" = units purchased ' +
    '(default 1 if unclear), and "unitCost" = the price per single unit in pesos (if only a line total ' +
    'is shown, divide it by the quantity; use 0 if unreadable). Ignore subtotals, totals, VAT/tax, ' +
    'discounts, cash/change, and any non-item lines. Return only the JSON.';

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: promptText }, { inline_data: { mime_type: mimeType, data } }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      code: { type: 'string' },
                      name: { type: 'string' },
                      quantity: { type: 'number' },
                      unitCost: { type: 'number' },
                    },
                    required: ['name', 'quantity', 'unitCost'],
                  },
                },
              },
              required: ['items'],
            },
          },
        }),
      }
    );

    const json = await res.json();
    if (!res.ok) {
      console.warn('[ScanReceipt] Gemini failed:', json?.error?.message || res.status);
      return null;
    }

    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];

    return items
      .map((it: any): ParsedReceiptLine => {
        const name = String(it?.name || '').trim();
        const code = String(it?.code || '').trim();
        const qty = Number(it?.quantity);
        const unitCost = Number(it?.unitCost);
        return {
          rawText: `${Number.isFinite(qty) && qty > 0 ? qty : 1} x ${name}${code ? ` (${code})` : ''}`.trim(),
          qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
          unitCost: Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : 0,
          code: code ? code.toUpperCase() : null,
          description: name,
        };
      })
      .filter((l: ParsedReceiptLine) => l.description || l.code);
  } catch (err) {
    console.warn('[ScanReceipt] Gemini threw:', err);
    return null;
  }
}

// Lines that are clearly not product rows (headers, totals, footers).
const NON_ITEM_LINE = /^(sub[- ]?total|total|vat|tax|amount\s*due|balance|change|cash|tender|thank|receipt|invoice|official|date|time|tin\b|address|tel|phone|cashier|store|branch|customer|qty\b.*price|item\s*description)/i;

/**
 * Best-effort parse of flat OCR text into candidate line items. This is
 * intentionally forgiving — real receipts vary wildly and OCR is noisy — so
 * the UI always lets the user correct qty/cost, re-match the product, and edit
 * the extracted code before anything is saved.
 */
export function parseReceiptLines(text: string): ParsedReceiptLine[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: ParsedReceiptLine[] = [];

  for (const raw of lines) {
    if (NON_ITEM_LINE.test(raw)) continue;

    // Money amounts (e.g. 1,234.56). A real product row almost always carries a
    // price; lines without one are headers/footers/store info, so skip them.
    const amounts = [...raw.matchAll(/(\d[\d,]*\.\d{2})/g)].map((m) => parseFloat(m[1].replace(/,/g, '')));
    if (amounts.length === 0) continue;

    // Supplier code: an alphanumeric token that MUST contain a digit (plus a
    // letter or separator) and be 4+ chars — e.g. WK-32-SS, AJ-100, SM-9. This
    // keeps ordinary words (Datu, Coke) and short sizes (50g) from being
    // mistaken for a code.
    let code: string | null = null;
    const codeMatch = raw.match(/\b([A-Za-z0-9][A-Za-z0-9\-/]{3,})\b/);
    if (codeMatch) {
      const c = codeMatch[1];
      if (/\d/.test(c) && /[A-Za-z\-/]/.test(c)) code = c.toUpperCase();
    }

    // Quantity + unit price. Receipts usually place them adjacent near the end
    // as "... QTY PRICE" (e.g. "12 18.50"). Prefer that pairing; otherwise fall
    // back to a leading quantity ("12x Name"), else qty 1 and the last amount.
    let qty = 1;
    let unitCost = amounts[amounts.length - 1];
    const qtyPrice = raw.match(/\b(\d{1,4})\s+(\d[\d,]*\.\d{2})\b/);
    if (qtyPrice) {
      qty = parseInt(qtyPrice[1], 10) || 1;
      unitCost = parseFloat(qtyPrice[2].replace(/,/g, ''));
    } else {
      const lead = raw.match(/^(\d{1,4})\s*(?:x|pcs?|pc|units?)\b/i);
      if (lead) qty = parseInt(lead[1], 10) || 1;
    }

    // Description: strip amounts, the code, a leading qty marker, and any
    // trailing bare quantity integer left behind.
    let description = raw
      .replace(/(\d[\d,]*\.\d{2})/g, '')
      .replace(/^(\d{1,4})\s*(?:x|pcs?|pc|units?)?\b/i, '');
    if (code) description = description.replace(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
    description = description.replace(/\b\d{1,4}\b\s*$/, '');
    description = description.replace(/[|_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

    if (!description && !code) continue;
    out.push({ rawText: raw, qty, unitCost, code, description });
  }

  return out;
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Token-overlap similarity in [0,1] between a receipt description and a product
 * name. Simple and dependency-free — the candidate sets are small (one
 * supplier's products), so this is plenty for ranking.
 */
export function tokenScore(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  let hits = 0;
  for (const t of ta) if (setB.has(t)) hits++;
  return hits / Math.max(ta.length, tb.length);
}

/** Longest token in a string — used to widen an unmatched line's shortlist. */
export function longestToken(s: string): string | null {
  const t = tokens(s).sort((a, b) => b.length - a.length);
  return t[0] || null;
}
