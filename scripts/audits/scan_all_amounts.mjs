import { createClient } from '@supabase/supabase-js';
import Tesseract from 'tesseract.js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function extractAmount(url) {
  try {
    const { data: { text } } = await Tesseract.recognize(url, 'eng');
    
    // Look for Amount patterns
    const amountRegex = /(?:Amount|PHP|P|₱|Php)\s*([0-9,]+\.\d{2})/ig;
    let match;
    let amounts = [];
    while ((match = amountRegex.exec(text)) !== null) {
      amounts.push(parseFloat(match[1].replace(/,/g, '')));
    }
    
    // Also look for just floating point numbers ending in .00
    const floatRegex = /([0-9,]+\.\d{2})/g;
    while ((match = floatRegex.exec(text)) !== null) {
      amounts.push(parseFloat(match[1].replace(/,/g, '')));
    }

    if (amounts.length > 0) {
      // Find the most common or largest amount (usually total)
      return Math.max(...amounts);
    }
  } catch (err) {
    console.error('OCR Error:', err.message);
  }
  return null;
}

async function backfillAllAmounts() {
  console.log('Fetching ALL payments...');
  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, amount, proof_url, payment_method')
    .is('ocr_amount', null)
    .not('proof_url', 'is', null);

  if (error) {
    console.error('Error fetching payments:', error);
    return;
  }

  console.log(`Found ${payments.length} payments to backfill.`);

  let updatedCount = 0;

  for (const payment of payments) {
    try {
      console.log(`Scanning payment ${payment.id} (${payment.payment_method})...`);
      const ocrAmount = await extractAmount(payment.proof_url);
      
      if (ocrAmount !== null) {
        console.log(` OCR amount found: ${ocrAmount}. Updating...`);
        const { error: updateError } = await supabase
          .from('payments')
          .update({ ocr_amount: ocrAmount })
          .eq('id', payment.id);
          
        if (updateError) {
           console.error(` Failed to update:`, updateError);
        } else {
           updatedCount++;
        }
      }
    } catch (err) {
      console.error(` Error processing payment ${payment.id}:`, err.message);
    }
  }
  
  console.log(`Finished processing. Updated ${updatedCount} payments.`);
}

backfillAllAmounts();
