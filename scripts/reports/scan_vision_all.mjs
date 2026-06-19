import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';
const supabase = createClient(supabaseUrl, supabaseKey);
const visionApiKey = 'AIzaSyCS7FPFRJoc5FV5Jwx-Wpq0icNVX5_H_W4';

async function scanVision() {
  console.log('Fetching payments with missing reference_number or missing ocr_amount...');
  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, proof_url, reference_number, ocr_amount')
    .not('proof_url', 'is', null)
    .or('reference_number.is.null,ocr_amount.is.null');

  if (error) {
    console.error('Error fetching payments:', error);
    return;
  }

  console.log(`Found ${payments.length} payments to scan with Google Cloud Vision API.`);

  let updatedCount = 0;

  for (const payment of payments) {
    try {
      console.log(`Scanning payment ${payment.id}...`);
      
      const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { source: { imageUri: payment.proof_url } },
              features: [{ type: 'TEXT_DETECTION' }]
            }
          ]
        })
      });

      const visionData = await visionResponse.json();
      
      if (!visionResponse.ok) {
        console.error(' Vision API Error:', visionData);
        continue;
      }

      const textAnnotations = visionData.responses?.[0]?.textAnnotations;
      if (!textAnnotations || textAnnotations.length === 0) {
        console.log(' No text found in image.');
        continue;
      }

      const fullText = textAnnotations[0].description;
      const cleanedText = fullText.replace(/[\s\-]/g, '');
      
      let newRef = payment.reference_number;
      if (!newRef) {
        const refRegex = /\d{13}/g;
        let match;
        if ((match = refRegex.exec(cleanedText)) !== null) {
          newRef = match[0];
          console.log(` Found Ref: ${newRef}`);
        }
      }

      let newAmount = payment.ocr_amount;
      if (!newAmount) {
        const amountRegex = /(?:Amount|PHP|P|₱|Php)\s*([0-9,]+\.\d{2})/ig;
        let match;
        let amounts = [];
        while ((match = amountRegex.exec(fullText)) !== null) {
          amounts.push(parseFloat(match[1].replace(/,/g, '')));
        }
        
        const floatRegex = /([0-9,]+\.\d{2})/g;
        while ((match = floatRegex.exec(fullText)) !== null) {
          amounts.push(parseFloat(match[1].replace(/,/g, '')));
        }

        if (amounts.length > 0) {
          newAmount = Math.max(...amounts);
          console.log(` Found Amount: ${newAmount}`);
        }
      }

      const updates = {};
      if (newRef !== payment.reference_number) updates.reference_number = newRef;
      if (newAmount !== payment.ocr_amount) updates.ocr_amount = newAmount;

      if (Object.keys(updates).length > 0) {
        console.log(` Updating Database...`);
        const { error: updateError } = await supabase
          .from('payments')
          .update(updates)
          .eq('id', payment.id);
          
        if (updateError) {
           console.error(` Failed to update:`, updateError);
        } else {
           updatedCount++;
        }
      } else {
        console.log(' No new data found for this image.');
      }
      
      // Sleep for a moment to avoid rate limits (if any)
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      console.error(` Error processing payment ${payment.id}:`, err.message);
    }
  }
  
  console.log(`Finished. Successfully updated ${updatedCount} payments using Google Cloud Vision.`);
}

scanVision();
