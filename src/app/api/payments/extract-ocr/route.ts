import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWorker } from 'tesseract.js';

export const maxDuration = 60;

/**
 * Receipt apps commonly put a date/time on the same visual row as "Ref No."
 * (label + first digit chunk on the left, date on the right), which flat
 * OCR text output interleaves into one line and splits the digit run in
 * two. Anchor on the label and strip the date/time fragment before
 * concatenating digits, falling back to a blind scan otherwise.
 */
function extractReferenceNumber(fullText: string): string | null {
  const labelIdx = fullText.search(/ref\.?\s*no\.?/i);
  if (labelIdx !== -1) {
    const window = fullText.slice(labelIdx, labelIdx + 150);
    const stripped = window.replace(
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s*\d{1,2},?\s*\d{4}(?:\s*\d{1,2}:\d{2}\s*(?:am|pm)?)?/gi,
      ' '
    );
    const digits = stripped.replace(/\D/g, '');
    if (digits.length >= 13) {
      return digits.slice(0, 13);
    }
  }
  const cleaned = fullText.replace(/[\s\-]/g, '');
  const match = cleaned.match(/\d{13}/);
  return match ? match[0] : null;
}

function extractOcrAmount(fullText: string): number | null {
  const amountRegex = /(?:Amount|PHP|P|₱|Php)\s*([0-9,]+\.\d{2})/ig;
  let amountMatch;
  const amounts: number[] = [];

  while ((amountMatch = amountRegex.exec(fullText)) !== null) {
    amounts.push(parseFloat(amountMatch[1].replace(/,/g, '')));
  }

  // Fallback for any floating point number ending in .00
  const floatRegex = /([0-9,]+\.\d{2})/g;
  while ((amountMatch = floatRegex.exec(fullText)) !== null) {
    amounts.push(parseFloat(amountMatch[1].replace(/,/g, '')));
  }

  if (amounts.length === 0) return null;
  // Find the maximum amount found (usually the total)
  return Math.max(...amounts);
}

async function runTesseract(proofUrl: string): Promise<string> {
  const worker = await createWorker('eng', undefined, {
    cachePath: '/tmp',
    cacheMethod: 'readWrite',
    logger: () => {},
  });
  try {
    const { data } = await worker.recognize(proofUrl);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

/**
 * Google Cloud Vision has a far more robust text model than Tesseract for
 * real-world photos (glare, angle, background clutter), but it costs money
 * per call. Used only as a fallback when Tesseract can't find what we need.
 * Returns null (rather than throwing) on any failure so a bad/missing key
 * doesn't take down the whole request — the caller still has Tesseract's
 * partial result to fall back on.
 */
async function runGoogleVision(proofUrl: string): Promise<string | null> {
  const visionApiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!visionApiKey) {
    console.warn('[OCR] Vision fallback skipped: GOOGLE_CLOUD_VISION_API_KEY is not set');
    return null;
  }

  try {
    const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { source: { imageUri: proofUrl } },
            features: [{ type: 'TEXT_DETECTION' }],
          },
        ],
      }),
    });
    const visionData = await visionResponse.json();
    if (!visionResponse.ok) {
      console.warn('[OCR] Vision fallback failed:', visionData);
      return null;
    }
    return visionData.responses?.[0]?.textAnnotations?.[0]?.description || null;
  } catch (err) {
    console.warn('[OCR] Vision fallback threw:', err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { proofUrl, paymentId } = body;

    if (!proofUrl || !paymentId) {
      return NextResponse.json({ error: 'Missing proofUrl or paymentId' }, { status: 400 });
    }

    console.log(`[OCR] Using Tesseract.js for ${paymentId}`);
    const tesseractText = await runTesseract(proofUrl);

    let referenceNumber = extractReferenceNumber(tesseractText);
    let ocrAmount = extractOcrAmount(tesseractText);
    let usedFallback = false;

    if (!referenceNumber || ocrAmount === null) {
      console.log(`[OCR] Tesseract incomplete (ref=${referenceNumber}, amount=${ocrAmount}) for ${paymentId}, trying Google Vision fallback`);
      const visionText = await runGoogleVision(proofUrl);
      if (visionText) {
        usedFallback = true;
        if (!referenceNumber) referenceNumber = extractReferenceNumber(visionText);
        if (ocrAmount === null) ocrAmount = extractOcrAmount(visionText);
      }
    }

    if (referenceNumber) {
      console.log(`[OCR] Found Ref: ${referenceNumber}${usedFallback ? ' (via Vision fallback)' : ''}`);
    }
    if (ocrAmount !== null) {
      console.log(`[OCR] Found Amount: ${ocrAmount}${usedFallback ? ' (via Vision fallback)' : ''}`);
    }

    if (referenceNumber || ocrAmount !== null) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const updates: any = {};
      if (referenceNumber) updates.reference_number = referenceNumber;
      if (ocrAmount !== null) updates.ocr_amount = ocrAmount;

      const { error } = await supabase
        .from('payments')
        .update(updates)
        .eq('id', paymentId);

      if (error) throw error;

      console.log(`[OCR] Finished. Saved to DB.`);
      return NextResponse.json({ success: true, referenceNumber, ocrAmount, usedFallback });
    }

    return NextResponse.json({ success: true, message: 'No reference number or amount found', usedFallback });

  } catch (error: any) {
    console.error('OCR Extraction Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to extract text' }, { status: 500 });
  }
}
