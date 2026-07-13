import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
// Please ensure you have your .env loaded or replace these with actual values if running manually.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DRY_RUN = false; // Set this to false to actually update the database!

async function parseAddressWithGemini(addressLine) {
  const prompt = `
You are an expert at parsing Philippine addresses.
Given the following raw address line, extract the components into a JSON object.
Try to use standard names for Region, Province, City/Municipality, and Barangay.
If you can't determine a component, leave it as an empty string.

Raw Address: "${addressLine}"

Output ONLY a JSON object in this exact format, with no markdown formatting or backticks:
{
  "region": "REGION X",
  "province": "Province Name",
  "city": "City or Municipality Name",
  "barangay": "Barangay Name",
  "postalCode": "1234",
  "streetAddress": "Building, House No, Street name"
}`;

  let parsed = null;
  let success = false;
  let attempts = 0;

  while (!success && attempts < 3) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
          }
        })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message);
      }
      
      let text = data.candidates[0].content.parts[0].text;
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(text);
      success = true;
    } catch (apiError) {
      attempts++;
      console.error(`Gemini API Error (Attempt ${attempts}):`, apiError.message);
      if (apiError.message.includes('Quota exceeded') || apiError.message.includes('429')) {
        console.log("⏳ Rate limit hit! Sleeping for 65 seconds to let the quota reset...");
        await new Promise(resolve => setTimeout(resolve, 65000));
      } else {
        console.log("⏳ Other API error. Waiting 5 seconds before retry...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  if (!success || !parsed) {
    console.log("⚠️ Skipped due to repeated parsing or API errors.");
    return null;
  }
  
  return parsed;
}

async function migrateAddresses() {
  console.log('Starting Address Migration Script...');
  console.log(`Dry Run Mode: ${DRY_RUN ? 'ON (No changes will be saved)' : 'OFF (Database will be updated)'}\n`);

  // 1. Fetch customers with old addresses and no region set yet
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, full_name, address_line')
    .is('region', null)
    .not('address_line', 'is', null)
    .neq('address_line', '');

  if (error) {
    console.error('Error fetching customers:', error);
    return;
  }

  console.log(`Found ${customers.length} customers to migrate.\n`);

  // 2. Loop through and migrate
  for (const customer of customers) {
    console.log(`Processing: ${customer.full_name}`);
    console.log(`Old Address: ${customer.address_line}`);
    
    const parsed = await parseAddressWithGemini(customer.address_line);
    
    if (parsed) {
      console.log(`Parsed:`, parsed);
      
      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from('customers')
          .update({
            region: parsed.region,
            province: parsed.province,
            city: parsed.city,
            barangay: parsed.barangay,
            postal_code: parsed.postalCode,
            street_address: parsed.streetAddress,
          })
          .eq('id', customer.id);
          
        if (updateError) {
          console.error(`❌ Failed to update ${customer.id}:`, updateError);
        } else {
          console.log(`✅ Successfully updated ${customer.full_name}`);
        }
      }
    } else {
      console.log(`⚠️ Skipped due to parsing error.`);
    }
    console.log('-----------------------------------');
    
    // Add a larger delay (10 seconds) to completely avoid the per-minute rate limit
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  console.log('\nMigration complete.');
  if (DRY_RUN) {
    console.log('To actually save these changes, change "const DRY_RUN = true;" to "false" in the script and run it again.');
  }
}

migrateAddresses();
