import { createClient } from '@supabase/supabase-js';
import Tesseract from 'tesseract.js';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function extractRef(url) {
  try {
    const { data: { text } } = await Tesseract.recognize(url, 'eng');
    
    // Strip all spaces and newlines
    const cleanedText = text.replace(/\s+/g, '');
    
    // Look for exactly 13 digits
    const refRegex = /\d{13}/g;
    let match;
    let refs = [];
    while ((match = refRegex.exec(cleanedText)) !== null) {
      refs.push(match[0]);
    }
    
    if (refs.length > 0) {
      return refs[0];
    }
  } catch (err) {
    console.error('OCR Error:', err.message);
  }
  return null;
}

async function backfillAllRefs() {
  console.log('Fetching ALL payments missing reference numbers...');
  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, proof_url, payment_method')
    .is('reference_number', null)
    .not('proof_url', 'is', null);

  if (error) {
    console.error('Error fetching payments:', error);
    return;
  }

  console.log(`Found ${payments.length} payments to backfill references.`);

  let updatedCount = 0;

  for (const payment of payments) {
    try {
      const ocrRef = await extractRef(payment.proof_url);
      
      if (ocrRef !== null) {
        console.log(` Payment ${payment.id} (${payment.payment_method}): Found Ref ${ocrRef}. Updating...`);
        const { error: updateError } = await supabase
          .from('payments')
          .update({ reference_number: ocrRef })
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
  
  console.log(`Finished processing. Updated ${updatedCount} payments with reference numbers.`);
}

backfillAllRefs();
