import { createClient } from '@supabase/supabase-js';
import stringSimilarity from 'string-similarity';
import fs from 'fs';

const supabaseUrl = 'https://sgkjdtwqqbrpmrfukhja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNna2pkdHdxcWJycG1yZnVraGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0MDIwNCwiZXhwIjoyMDkyMzE2MjA0fQ.5d5qUGirSWmOsOz-WrStpi0ZYcVcMWZ4Zf_rDdfEqOA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateHTMLReport() {
  const { data: allProducts, error } = await supabase.from('products').select('id, name, description, images, selling_price, sku, parent_id');
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }
  
  // Keep all products as requested to show all 11 exact matches
  const products = allProducts;
  
  const imageCounts = {};
  const priceGroups = {};
  const nameCounts = {};
  
  products.forEach(p => {
    // 1. Check Images
    if (p.images && p.images.length > 0) {
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
    
    // Group by Name
    if (p.name) {
      if (!nameCounts[p.name]) {
        nameCounts[p.name] = [];
      }
      nameCounts[p.name].push(p);
    }
  });
  
  const duplicateImages = [];
  for (const img in imageCounts) {
    if (imageCounts[img].length > 1) {
      duplicateImages.push({
        image: img,
        count: imageCounts[img].length,
        items: imageCounts[img].map(p => ({id: p.id, name: p.name, description: p.description, sku: p.sku, price: p.selling_price}))
      });
    }
  }
  
  const duplicateNames = [];
  for (const name in nameCounts) {
    if (nameCounts[name].length > 1) {
      duplicateNames.push({
        name: name,
        count: nameCounts[name].length,
        items: nameCounts[name].map(p => ({id: p.id, image: p.images ? p.images[0] : null, description: p.description, sku: p.sku, price: p.selling_price}))
      });
    }
  }
  
  const SIMILARITY_THRESHOLD = 0.85;
  const processedPairs = new Set();
  const similarDescDuplicates = [];
  
  for (const price in priceGroups) {
    const items = priceGroups[price];
    if (items.length > 1) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const p1 = items[i];
          const p2 = items[j];
          
          if (!p1.description || !p2.description) continue;
          if (p1.name === p2.name) continue; 
          
          const pairKey = [p1.id, p2.id].sort().join('-');
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);
          
          const similarity = stringSimilarity.compareTwoStrings(p1.description, p2.description);
          
          if (similarity >= SIMILARITY_THRESHOLD) {
            similarDescDuplicates.push({
              price: p1.selling_price,
              similarity: (similarity * 100).toFixed(1),
              item1: { id: p1.id, name: p1.name, image: p1.images ? p1.images[0] : '', description: p1.description, sku: p1.sku, price: p1.selling_price },
              item2: { id: p2.id, name: p2.name, image: p2.images ? p2.images[0] : '', description: p2.description, sku: p2.sku, price: p2.selling_price }
            });
          }
        }
      }
    }
  }

  // Generate HTML
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Duplicate Products Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f4f4f9; color: #333; margin: 0; padding: 20px; }
  h1, h2 { color: #2c3e50; }
  .container { max-width: 1200px; margin: auto; }
  .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
  .group { border: 1px solid #ddd; border-radius: 6px; padding: 15px; margin-bottom: 20px; background: #fafafa; }
  .group-title { font-weight: bold; margin-bottom: 10px; font-size: 1.1em; color: #e74c3c; }
  .item-list { list-style: none; padding: 0; margin: 0; }
  .item-list li { padding: 8px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 15px; }
  .item-list li:last-child { border-bottom: none; }
  .img-preview { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; }
  .badge { background: #3498db; color: white; padding: 3px 8px; border-radius: 12px; font-size: 0.8em; font-weight: bold; }
  .pair-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }
  .product-box { border: 1px solid #ddd; padding: 10px; border-radius: 6px; background: white; display: flex; align-items: center; gap: 10px; }
  .product-box img { width: 60px; height: 60px; object-fit: cover; border-radius: 4px; }
  .btn { background: #3498db; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; margin-top: 5px; font-weight: bold; }
  .btn:hover { background: #2980b9; }
  .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; }
  .modal.active { display: flex; }
  .modal-content { background: white; padding: 20px; border-radius: 8px; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
  .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 15px; }
  .modal-close { background: none; border: none; font-size: 1.5em; cursor: pointer; color: #7f8c8d; }
</style>
</head>
<body>
<div class="container">
  <h1>Product Duplicates Report</h1>
  <p>This report identifies potential duplicate products based on shared image URLs, and products with the exact same price and highly similar descriptions (>85%).</p>
  
  <div class="card">
    <h2>1. Same Price & Similar Descriptions (${similarDescDuplicates.length} pairs)</h2>
    <p>These products share the same price and their descriptions are highly similar. They are likely variations of the same product.</p>
`;

  similarDescDuplicates.forEach((pair, index) => {
    html += `
    <div class="group">
      <div class="group-title">Match #${index + 1} <span class="badge">Price: ₱${pair.price}</span> <span class="badge" style="background:#2ecc71;">Similarity: ${pair.similarity}%</span></div>
      <div class="pair-grid">
        <div class="product-box" style="flex-direction: column; align-items: stretch;">
          <div style="display: flex; gap: 10px;">
            ${pair.item1.image ? `<img src="${pair.item1.image}" alt="Preview">` : ''}
            <div><strong>${pair.item1.name}</strong><br><small>ID: ${pair.item1.id}</small></div>
          </div>
          <button class="btn" onclick="openModal(this)" data-name="${(pair.item1.name || '').replace(/"/g, '&quot;')}" data-sku="${pair.item1.sku || ''}" data-price="${pair.item1.price || 0}" data-desc="${(pair.item1.description || '').replace(/"/g, '&quot;')}">View Details</button>
        </div>
        <div class="product-box" style="flex-direction: column; align-items: stretch;">
          <div style="display: flex; gap: 10px;">
            ${pair.item2.image ? `<img src="${pair.item2.image}" alt="Preview">` : ''}
            <div><strong>${pair.item2.name}</strong><br><small>ID: ${pair.item2.id}</small></div>
          </div>
          <button class="btn" onclick="openModal(this)" data-name="${(pair.item2.name || '').replace(/"/g, '&quot;')}" data-sku="${pair.item2.sku || ''}" data-price="${pair.item2.price || 0}" data-desc="${(pair.item2.description || '').replace(/"/g, '&quot;')}">View Details</button>
        </div>
      </div>
    </div>
    `;
  });

  html += `
  </div>
  
  <div class="card">
    <h2>2. Duplicate Image URLs (${duplicateImages.length} groups)</h2>
    <p>The following groups of products use the exact same image URL.</p>
`;

  duplicateImages.forEach((group, index) => {
    html += `
    <div class="group">
      <div class="group-title">Image Group #${index + 1} (${group.count} items)</div>
      <div style="display: flex; gap: 20px;">
        <img src="${group.image}" class="img-preview" style="width: 100px; height: 100px;" alt="Duplicate Image">
        <ul class="item-list" style="flex: 1;">
          ${group.items.map(item => `
          <li style="flex-direction: column; align-items: stretch;">
            <div><strong>${item.name}</strong> <small style="color:#7f8c8d;">(ID: ${item.id})</small></div>
            <button class="btn" onclick="openModal(this)" data-name="${(item.name || '').replace(/"/g, '&quot;')}" data-sku="${item.sku || ''}" data-price="${item.price || 0}" data-desc="${(item.description || '').replace(/"/g, '&quot;')}">View Details</button>
          </li>`).join('')}
        </ul>
      </div>
    </div>
    `;
  });

  html += `
  </div>

  <div class="card">
    <h2>3. Exact Name Matches (${duplicateNames.length} groups)</h2>
    <p>The following groups of products have the exact same product name.</p>
`;

  duplicateNames.forEach((group, index) => {
    html += `
    <div class="group">
      <div class="group-title">Name Group #${index + 1}: ${group.name} (${group.count} items)</div>
      <ul class="item-list">
        ${group.items.map(item => `
          <li style="flex-direction: column; align-items: stretch;">
            <div style="display: flex; align-items: center; gap: 10px;">
              ${item.image ? `<img src="${item.image}" class="img-preview" style="width: 50px; height: 50px;">` : ''}
              <div><strong>${item.name || group.name}</strong><br><small style="color:#7f8c8d;">ID: ${item.id}</small></div>
            </div>
            <button class="btn" onclick="openModal(this)" data-name="${(item.name || group.name || '').replace(/"/g, '&quot;')}" data-sku="${item.sku || ''}" data-price="${item.price || 0}" data-desc="${(item.description || '').replace(/"/g, '&quot;')}">View Details</button>
          </li>
        `).join('')}
      </ul>
    </div>
    `;
  });

  html += `
  </div>
</div>

<div class="modal" id="infoModal">
  <div class="modal-content">
    <div class="modal-header">
      <h3 id="modalTitle" style="margin:0;">Product Details</h3>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div style="margin-bottom:10px;"><strong>SKU:</strong> <span id="modalSku"></span></div>
    <div style="margin-bottom:10px;"><strong>Price:</strong> ₱<span id="modalPrice"></span></div>
    <div><strong>Description:</strong></div>
    <div id="modalDesc" style="white-space: pre-wrap; font-size: 0.9em; color: #555; background: #f9f9f9; padding: 10px; border-radius: 4px; margin-top: 5px; border: 1px solid #eee;"></div>
  </div>
</div>
<script>
  function openModal(btn) {
    document.getElementById('modalTitle').textContent = btn.getAttribute('data-name') || 'Product Details';
    document.getElementById('modalSku').textContent = btn.getAttribute('data-sku') || 'N/A';
    document.getElementById('modalPrice').textContent = btn.getAttribute('data-price') || '0';
    document.getElementById('modalDesc').textContent = btn.getAttribute('data-desc') || 'No description available.';
    document.getElementById('infoModal').classList.add('active');
  }
  function closeModal() {
    document.getElementById('infoModal').classList.remove('active');
  }
  
  // Close modal when clicking outside
  document.getElementById('infoModal').addEventListener('click', function(e) {
    if (e.target === this) {
      closeModal();
    }
  });
</script>

</body>
</html>`;

  fs.writeFileSync('duplicate_products_report.html', html);
  console.log('HTML report generated: duplicate_products_report.html');
}

generateHTMLReport();
