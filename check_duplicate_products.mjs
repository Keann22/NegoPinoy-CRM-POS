import { createClient } from '@supabase/supabase-js';
import stringSimilarity from 'string-similarity';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
  const { data: products, error } = await supabase.from('products').select('id, name, description, images, selling_price, sku');
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }
  
  console.log(`Fetched ${products.length} products.`);
  
  const imageCounts = {};
  const duplicateImages = [];
  
  // To check description similarity with same price
  // We'll compare every pair, but to be efficient, we can group by selling_price first
  const priceGroups = {};
  const similarDescDuplicates = [];
  
  products.forEach(p => {
    // 1. Check Images
    if (p.images && p.images.length > 0) {
      // Use the first image URL or stringified array
      const imgKey = p.images[0];
      if (!imageCounts[imgKey]) {
        imageCounts[imgKey] = [];
      }
      imageCounts[imgKey].push(p);
    }
    
    // Group by price for description comparison
    if (p.selling_price !== null && p.selling_price !== undefined) {
      if (!priceGroups[p.selling_price]) {
        priceGroups[p.selling_price] = [];
      }
      priceGroups[p.selling_price].push(p);
    }
  });
  
  for (const img in imageCounts) {
    if (imageCounts[img].length > 1) {
      duplicateImages.push({
        image: img,
        count: imageCounts[img].length,
        items: imageCounts[img].map(p => ({id: p.id, name: p.name}))
      });
    }
  }
  
  // 2. Check similar descriptions within the same price bracket
  // We'll use a similarity threshold of 0.8 (80%)
  const SIMILARITY_THRESHOLD = 0.85;
  const processedPairs = new Set();
  
  for (const price in priceGroups) {
    const items = priceGroups[price];
    if (items.length > 1) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const p1 = items[i];
          const p2 = items[j];
          
          if (!p1.description || !p2.description) continue;
          
          // Avoid 100% exact matches on name if they are already flagged as name duplicates
          if (p1.name === p2.name) continue; 
          
          const pairKey = [p1.id, p2.id].sort().join('-');
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);
          
          const similarity = stringSimilarity.compareTwoStrings(p1.description, p2.description);
          
          if (similarity >= SIMILARITY_THRESHOLD) {
            similarDescDuplicates.push({
              price: p1.selling_price,
              similarity: similarity.toFixed(2),
              item1: { id: p1.id, name: p1.name },
              item2: { id: p2.id, name: p2.name }
            });
          }
        }
      }
    }
  }
  
  if (duplicateImages.length > 0) {
    console.log(`\nFound ${duplicateImages.length} duplicate product image URLs:`);
    console.log(JSON.stringify(duplicateImages, null, 2));
  } else {
    console.log('\nNo duplicate product image URLs found.');
  }
  
  if (similarDescDuplicates.length > 0) {
    console.log(`\nFound ${similarDescDuplicates.length} products with same price and highly similar descriptions (>85%):`);
    console.log(JSON.stringify(similarDescDuplicates, null, 2));
  } else {
    console.log('\nNo products found with same price and highly similar descriptions.');
  }
}

checkDuplicates();
