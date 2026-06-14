import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Tesseract from 'tesseract.js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { proofUrl, paymentId } = body;

    if (!proofUrl || !paymentId) {
      return NextResponse.json({ error: 'Missing proofUrl or paymentId' }, { status: 400 });
    }

    let referenceNumber = null;
    let usedEngine = 'None';

    // ---------------------------------------------------------
    // STEP 1: Attempt Free OCR with Tesseract
    // ---------------------------------------------------------
    try {
      console.log(`[OCR] Step 1: Trying Tesseract for ${paymentId}`);
      const { data: { text: tesseractText } } = await Tesseract.recognize(proofUrl, 'eng');
      
      const cleanedText = tesseractText.replace(/[\s\-]/g, '');
      const refRegex = /\d{13}/g;
      let match;
      
      if ((match = refRegex.exec(cleanedText)) !== null) {
        referenceNumber = match[0];
        usedEngine = 'Tesseract';
        console.log(`[OCR] Success with Tesseract! Found Ref: ${referenceNumber}`);
      } else {
         console.log(`[OCR] Tesseract failed to find 13-digit reference number.`);
      }
    } catch (tesseractError) {
      console.error('[OCR] Tesseract Engine Error:', tesseractError);
    }

    // ---------------------------------------------------------
    // STEP 2: Fallback to Google Cloud Vision API
    // ---------------------------------------------------------
    if (!referenceNumber) {
      console.log(`[OCR] Step 2: Falling back to Google Cloud Vision API for ${paymentId}`);
      const visionApiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
      
      if (!visionApiKey) {
        console.error('[OCR] Google Cloud Vision API key is missing');
      } else {
        const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { source: { imageUri: proofUrl } },
                features: [{ type: 'TEXT_DETECTION' }]
              }
            ]
          })
        });

        const visionData = await visionResponse.json();
        
        if (!visionResponse.ok) {
          console.error('[OCR] Vision API Error:', visionData);
        } else {
          const textAnnotations = visionData.responses?.[0]?.textAnnotations;
          if (textAnnotations && textAnnotations.length > 0) {
            const fullText = textAnnotations[0].description;
            const cleanedText = fullText.replace(/[\s\-]/g, '');
            
            const refRegex = /\d{13}/g;
            let match;
            if ((match = refRegex.exec(cleanedText)) !== null) {
              referenceNumber = match[0];
              usedEngine = 'Google Cloud Vision';
              console.log(`[OCR] Success with Cloud Vision! Found Ref: ${referenceNumber}`);
            } else {
              console.log(`[OCR] Cloud Vision also failed to find 13-digit reference number.`);
            }
          }
        }
      }
    }

    // ---------------------------------------------------------
    // STEP 3: Save to Database
    // ---------------------------------------------------------
    if (referenceNumber) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase
        .from('payments')
        .update({ reference_number: referenceNumber })
        .eq('id', paymentId);

      if (error) throw error;
      
      console.log(`[OCR] Finished. Saved Ref: ${referenceNumber} via ${usedEngine}`);
      return NextResponse.json({ success: true, referenceNumber, engine: usedEngine });
    }

    return NextResponse.json({ success: true, message: 'No reference number found by either engine' });
    
  } catch (error: any) {
    console.error('OCR Extraction Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to extract text' }, { status: 500 });
  }
}
