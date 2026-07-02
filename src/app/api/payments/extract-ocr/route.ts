import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWorker } from 'tesseract.js';

export const maxDuration = 60;

/**
 * Receipt apps commonly put a date/time on the same visual row as "Ref No."
 * (label + first digit chunk on the left, date on the right), which
 * Tesseract's flat text output interleaves into one line and splits the
 * digit run in two. Anchor on the label and strip the date/time fragment
 * before concatenating digits, falling back to a blind scan otherwise.
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { proofUrl, paymentId } = body;

    if (!proofUrl || !paymentId) {
      return NextResponse.json({ error: 'Missing proofUrl or paymentId' }, { status: 400 });
    }

    let referenceNumber = null;
    let ocrAmount = null;

    console.log(`[OCR] Using Tesseract.js for ${paymentId}`);

    const worker = await createWorker('eng', undefined, {
      cachePath: '/tmp',
      cacheMethod: 'readWrite',
      logger: () => {},
    });

    let fullText = '';
    try {
      const { data } = await worker.recognize(proofUrl);
      fullText = data.text || '';
    } finally {
      await worker.terminate();
    }

    if (fullText) {
      // 1. Extract Reference Number (13 digits)
      referenceNumber = extractReferenceNumber(fullText);
      if (referenceNumber) {
        console.log(`[OCR] Found Ref: ${referenceNumber}`);
      }

      // 2. Extract Amount
      const amountRegex = /(?:Amount|PHP|P|₱|Php)\s*([0-9,]+\.\d{2})/ig;
      let amountMatch;
      let amounts: number[] = [];

      while ((amountMatch = amountRegex.exec(fullText)) !== null) {
        amounts.push(parseFloat(amountMatch[1].replace(/,/g, '')));
      }

      // Fallback for any floating point number ending in .00
      const floatRegex = /([0-9,]+\.\d{2})/g;
      while ((amountMatch = floatRegex.exec(fullText)) !== null) {
        amounts.push(parseFloat(amountMatch[1].replace(/,/g, '')));
      }

      if (amounts.length > 0) {
        // Find the maximum amount found (usually the total)
        ocrAmount = Math.max(...amounts);
        console.log(`[OCR] Found Amount: ${ocrAmount}`);
      }
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
      return NextResponse.json({ success: true, referenceNumber, ocrAmount });
    }

    return NextResponse.json({ success: true, message: 'No reference number or amount found' });
    
  } catch (error: any) {
    console.error('OCR Extraction Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to extract text' }, { status: 500 });
  }
}
