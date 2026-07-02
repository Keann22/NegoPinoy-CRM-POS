import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWorker } from 'tesseract.js';

export const maxDuration = 60;

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
      const cleanedText = fullText.replace(/[\s\-]/g, '');

      // 1. Extract Reference Number (13 digits)
      const refRegex = /\d{13}/g;
      let refMatch;
      if ((refMatch = refRegex.exec(cleanedText)) !== null) {
        referenceNumber = refMatch[0];
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
