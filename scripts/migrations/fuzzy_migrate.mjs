import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const addressData = JSON.parse(fs.readFileSync('src/lib/philippine-address-data.json', 'utf8'));
const unmigrated = JSON.parse(fs.readFileSync('unmigrated_addresses.json', 'utf8'));
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Build a flat list of all locations for fast searching
const locations = [];
for (const [regionCode, r] of Object.entries(addressData)) {
  if (!r.province_list) continue;
  for (const [provName, p] of Object.entries(r.province_list)) {
    if (!p.municipality_list) continue;
    for (const [cityName, m] of Object.entries(p.municipality_list)) {
      if (!m.barangay_list) continue;
      for (const brgyName of m.barangay_list) {
        locations.push({
          regionCode,
          regionName: r.region_name,
          province: provName,
          city: cityName,
          barangay: brgyName
        });
      }
    }
  }
}

async function run() {
  let count = 0;
  for (const c of unmigrated) {
    const raw = c.address_line.toLowerCase().replace(/[^\w\s]/g, ' ');
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const loc of locations) {
      let score = 0;
      
      // Match province
      if (raw.includes(loc.province.toLowerCase())) score += 10;
      
      // Match city
      if (raw.includes(loc.city.toLowerCase())) score += 30;
      
      // Match barangay
      // Ensure we match whole words for barangay to avoid false positives on short names
      const brgyLower = loc.barangay.toLowerCase();
      if (brgyLower.length > 3) {
          if (raw.includes(brgyLower)) score += 50;
      } else {
          const regex = new RegExp(`\\b${brgyLower}\\b`);
          if (regex.test(raw)) score += 50;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = loc;
      }
    }
    
    // We need at least a city match OR a strong barangay match
    if (bestMatch && bestScore >= 30) {
      console.log(`[${bestScore}] Matched ${c.full_name}: ${bestMatch.province}, ${bestMatch.city}, ${bestMatch.barangay}  --- FROM: ${c.address_line}`);
      
      const { error } = await supabase.from('customers').update({
        region: bestMatch.regionCode,
        province: bestMatch.province,
        city: bestMatch.city,
        barangay: bestMatch.barangay,
        street_address: c.address_line
      }).eq('id', c.id);
      
      if (!error) count++;
    } else {
      console.log(`Failed to match: ${c.address_line}`);
    }
  }
  console.log('Successfully updated: ' + count + ' out of ' + unmigrated.length);
}
run();
