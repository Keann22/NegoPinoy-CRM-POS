import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Handle optional JSON API endpoint if query ?json=1
  const url = new URL(req.url);
  const isJson = url.searchParams.get("json") === "1";

  try {
    const { data: rawProducts, error } = await supabase
      .from("products")
      .select("id, name, sku, category, selling_price, sale_price, is_on_sale, stock_level, images, variant_name")
      .or("name.ilike.%sale%,variant_name.ilike.%sale%")
      .order("name", { ascending: true });

    if (error) {
      return new Response("Error querying products: " + error.message, { status: 500 });
    }

    // Filter out deleted/archived products
    const products = (rawProducts || []).filter(p => {
      const isArchived = p.category === "Archived" || (p.name && p.name.includes("[DELETED]"));
      return !isArchived;
    });

    if (isJson) {
      return new Response(JSON.stringify(products), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const safeJson = JSON.stringify(products).replace(/</g, "\\u003c");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>NegoPinoy — Sale Items Catalog</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(20, 27, 45, 0.7);
      --card-hover: rgba(28, 38, 64, 0.9);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #f59e0b;
      --accent-rgb: 245, 158, 11;
      --accent-glow: rgba(245, 158, 11, 0.25);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.2);
      --danger: #ef4444;
      --danger-glow: rgba(239, 68, 68, 0.2);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding-bottom: 5rem;
      background-image: 
        radial-gradient(at 15% 15%, rgba(245, 158, 11, 0.07) 0px, transparent 55%),
        radial-gradient(at 85% 25%, rgba(59, 130, 246, 0.08) 0px, transparent 55%),
        radial-gradient(at 50% 90%, rgba(139, 92, 246, 0.06) 0px, transparent 50%);
      background-attachment: fixed;
      -webkit-font-smoothing: antialiased;
    }

    /* Top Sticky Header */
    .header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(9, 13, 22, 0.9);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--card-border);
      padding: 0.85rem 1.25rem;
    }
    .header-inner {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
    }
    .brand-logo {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #f59e0b, #ef4444);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: white;
      font-size: 1.15rem;
      box-shadow: 0 4px 14px var(--accent-glow);
    }
    .brand-title {
      font-size: 1.2rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(to right, #ffffff, #cbd5e1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .brand-tag {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
      margin-left: 0.5rem;
    }
    .btn-refresh {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      color: var(--text-muted);
      padding: 0.45rem 0.85rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s;
    }
    .btn-refresh:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    /* Container */
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.75rem 1.25rem;
    }

    /* Hero section */
    .hero {
      text-align: center;
      margin-bottom: 2rem;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.25);
      color: #fbbf24;
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 0.75rem;
    }
    .hero h1 {
      font-size: 2.2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #ffffff 40%, #fbbf24 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p {
      color: var(--text-muted);
      font-size: 0.95rem;
      max-width: 580px;
      margin: 0 auto;
      line-height: 1.5;
    }

    /* Stats Bar */
    .stats-bar {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.25rem;
      justify-content: center;
      flex-wrap: wrap;
    }
    .stat-pill {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 0.5rem 1rem;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.825rem;
      color: var(--text-muted);
      backdrop-filter: blur(8px);
    }
    .stat-pill strong {
      color: #ffffff;
      font-size: 0.95rem;
    }

    /* Search & Filters */
    .toolbar {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.75rem;
    }
    .search-row {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }
    .search-box {
      position: relative;
      flex-grow: 1;
    }
    .search-box input {
      width: 100%;
      padding: 0.9rem 1.25rem 0.9rem 2.85rem;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      color: #fff;
      font-size: 0.95rem;
      font-family: inherit;
      outline: none;
      transition: all 0.2s ease;
      backdrop-filter: blur(12px);
    }
    .search-box input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-glow);
    }
    .search-icon {
      position: absolute;
      left: 1rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
    }
    .search-clear {
      position: absolute;
      right: 0.85rem;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255,255,255,0.1);
      border: none;
      color: var(--text-muted);
      width: 22px;
      height: 22px;
      border-radius: 50%;
      font-size: 0.75rem;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .search-clear.show { display: flex; }

    /* Filter Controls */
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .filter-pills {
      display: flex;
      gap: 0.45rem;
      overflow-x: auto;
      padding-bottom: 0.25rem;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    .filter-pills::-webkit-scrollbar { display: none; }
    .filter-pill {
      padding: 0.4rem 0.85rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      border-radius: 9999px;
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-pill:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
    .filter-pill.active {
      background: var(--accent);
      color: #000;
      border-color: var(--accent);
      box-shadow: 0 2px 10px var(--accent-glow);
    }
    .stock-toggle-label {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.825rem;
      color: var(--text-muted);
      cursor: pointer;
      user-select: none;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 0.4rem 0.75rem;
      border-radius: 10px;
    }
    .stock-toggle-label input {
      accent-color: var(--success);
      cursor: pointer;
    }

    /* Product Cards Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.25rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      backdrop-filter: blur(12px);
    }
    .card:hover {
      transform: translateY(-4px);
      background: var(--card-hover);
      border-color: rgba(245, 158, 11, 0.35);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
    }

    /* Product Image Wrap */
    .image-wrap {
      width: 100%;
      height: 210px;
      background: #0f172a;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .image-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s ease;
    }
    .card:hover .image-wrap img {
      transform: scale(1.06);
    }
    .img-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      color: #64748b;
      font-size: 0.8rem;
      font-weight: 500;
    }

    /* Badges */
    .badge-stock {
      position: absolute;
      top: 0.65rem;
      right: 0.65rem;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 700;
      backdrop-filter: blur(10px);
      letter-spacing: 0.02em;
    }
    .stock-available {
      background: rgba(16, 185, 129, 0.22);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .stock-low {
      background: rgba(245, 158, 11, 0.22);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }
    .stock-out {
      background: rgba(239, 68, 68, 0.22);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }

    /* Card Body */
    .card-body {
      padding: 1.15rem;
      display: flex;
      flex-direction: column;
      flex-grow: 1;
      gap: 0.6rem;
    }
    .category-tag {
      font-size: 0.7rem;
      font-weight: 700;
      color: #60a5fa;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .product-name {
      font-size: 0.98rem;
      font-weight: 700;
      line-height: 1.4;
      color: #f8fafc;
      min-height: 2.7rem;
    }
    .sku-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.74rem;
      color: var(--text-muted);
      background: rgba(0, 0, 0, 0.3);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      width: fit-content;
      cursor: pointer;
      border: 1px solid rgba(255,255,255,0.05);
      transition: all 0.2s;
    }
    .sku-pill:hover {
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.4);
    }

    /* Price Section */
    .price-row {
      margin-top: auto;
      padding-top: 0.75rem;
      border-top: 1px solid var(--card-border);
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .price-val {
      font-size: 1.35rem;
      font-weight: 800;
      color: #fbbf24;
      letter-spacing: -0.01em;
    }
    .price-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
    }

    /* Copy Button */
    .btn-copy {
      width: 100%;
      padding: 0.68rem;
      margin-top: 0.4rem;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.28);
      border-radius: 12px;
      color: #fbbf24;
      font-size: 0.825rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      transition: all 0.2s;
      font-family: inherit;
    }
    .btn-copy:hover {
      background: #f59e0b;
      color: #090d16;
      box-shadow: 0 4px 14px var(--accent-glow);
    }
    .btn-copy:active {
      transform: scale(0.98);
    }

    /* Floating Toast */
    .toast {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #10b981;
      color: #ffffff;
      padding: 0.75rem 1.4rem;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.875rem;
      box-shadow: 0 12px 30px rgba(0,0,0,0.6);
      z-index: 100;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    .no-results {
      grid-column: 1 / -1;
      text-align: center;
      padding: 4.5rem 1rem;
      color: var(--text-muted);
    }
    .no-results h3 {
      font-size: 1.25rem;
      color: #fff;
      margin-bottom: 0.5rem;
    }

    @media (max-width: 640px) {
      .hero h1 { font-size: 1.7rem; }
      .grid { grid-template-columns: 1fr; }
      .container { padding: 1.25rem 1rem; }
      .header-inner { flex-direction: row; }
      .brand-title { font-size: 1.05rem; }
      .filter-bar { flex-direction: column; align-items: stretch; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <div class="brand">
        <div class="brand-logo">N</div>
        <div>
          <span class="brand-title">NegoPinoy</span>
          <span class="brand-tag">Staff Catalog</span>
        </div>
      </div>
      <button class="btn-refresh" onclick="location.reload()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        Refresh
      </button>
    </div>
  </header>

  <main class="container">
    <div class="hero">
      <div class="hero-badge">🔥 Staff Quick Reference</div>
      <h1>Sale Items Catalog</h1>
      <p>Instant price, stock check & one-click copy sheet for customer inquiries.</p>
      <div class="stats-bar" id="statsBar"></div>
    </div>

    <div class="toolbar">
      <div class="search-row">
        <div class="search-box">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="searchInput" placeholder="Search by name, SKU, or category...">
          <button class="search-clear" id="searchClear" onclick="clearSearch()">✕</button>
        </div>
      </div>

      <div class="filter-bar">
        <div class="filter-pills" id="categoryPills"></div>
        <label class="stock-toggle-label">
          <input type="checkbox" id="inStockOnly" onchange="filterAndRender()">
          <span>In Stock Only</span>
        </label>
      </div>
    </div>

    <div class="grid" id="productGrid"></div>
  </main>

  <div class="toast" id="toast">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span id="toastText">Copied to clipboard!</span>
  </div>

  <script>
    const products = ${safeJson};
    let activeCategory = 'ALL';
    let searchQuery = '';

    function formatPeso(val) {
      const num = parseFloat(val) || 0;
      return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function renderStats() {
      const total = products.length;
      const inStock = products.filter(p => (p.stock_level || 0) > 0).length;
      const totalCategories = new Set(products.map(p => p.category || 'General')).size;

      document.getElementById('statsBar').innerHTML = \`
        <div class="stat-pill">Total Sale Items: <strong>\${total}</strong></div>
        <div class="stat-pill">In Stock: <strong style="color: #34d399;">\${inStock}</strong></div>
        <div class="stat-pill">Categories: <strong>\${totalCategories}</strong></div>
      \`;
    }

    function renderCategoryPills() {
      const categories = ['ALL', ...Array.from(new Set(products.map(p => p.category || 'General'))).sort()];
      const pillsContainer = document.getElementById('categoryPills');
      
      pillsContainer.innerHTML = categories.map(cat => \`
        <button class="filter-pill \${cat === activeCategory ? 'active' : ''}" onclick="setCategory('\${cat}')">
          \${cat}
        </button>
      \`).join('');
    }

    function setCategory(cat) {
      activeCategory = cat;
      renderCategoryPills();
      filterAndRender();
    }

    function clearSearch() {
      document.getElementById('searchInput').value = '';
      document.getElementById('searchClear').classList.remove('show');
      searchQuery = '';
      filterAndRender();
    }

    function getStockBadge(stock) {
      const s = parseInt(stock, 10) || 0;
      if (s > 10) return \`<span class="badge-stock stock-available">\${s} in stock</span>\`;
      if (s > 0) return \`<span class="badge-stock stock-low">Only \${s} left</span>\`;
      return \`<span class="badge-stock stock-out">Out of stock</span>\`;
    }

    function copyToClipboard(text, customToast) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(customToast || 'Copied: "' + text + '"');
      }).catch(() => {
        showToast('Copied to clipboard!');
      });
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      const toastText = document.getElementById('toastText');
      toastText.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, 2200);
    }

    function filterAndRender() {
      const q = searchQuery.toLowerCase().trim();
      const inStockOnly = document.getElementById('inStockOnly').checked;

      const filtered = products.filter(p => {
        const matchesCategory = activeCategory === 'ALL' || (p.category || 'General') === activeCategory;
        const matchesQuery = !q || 
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q));
        const matchesStock = !inStockOnly || (p.stock_level || 0) > 0;
        return matchesCategory && matchesQuery && matchesStock;
      });

      const grid = document.getElementById('productGrid');
      if (filtered.length === 0) {
        grid.innerHTML = \`
          <div class="no-results">
            <h3>No matching products found</h3>
            <p>Try adjusting your search terms or unchecking "In Stock Only".</p>
          </div>
        \`;
        return;
      }

      grid.innerHTML = filtered.map(p => {
        const price = formatPeso(p.selling_price);
        const imageUrl = (p.images && p.images.length > 0) ? p.images[0] : null;
        const copyPayload = (p.name || '') + ' - ' + price;
        const safeCopyText = copyPayload.replace(/'/g, "\\\\'");
        const safeSku = (p.sku || '').replace(/'/g, "\\\\'");

        return \`
          <div class="card">
            <div class="image-wrap">
              \${imageUrl ? \`
                <img src="\${imageUrl}" alt="\${p.name}" loading="lazy" onerror="this.outerHTML='<div class=\\'img-placeholder\\'><svg width=\\'32\\' height=\\'32\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'></rect><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'></circle><path d=\\'M21 15l-5-5L5 21\\'></path></svg><span>Image not available</span></div>'">
              \` : \`
                <div class="img-placeholder">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <path d="M21 15l-5-5L5 21"></path>
                  </svg>
                  <span>No Image</span>
                </div>
              \`}
              \${getStockBadge(p.stock_level)}
            </div>
            <div class="card-body">
              <span class="category-tag">\${p.category || 'General'}</span>
              <h3 class="product-name">\${p.name}</h3>
              <div>
                <span class="sku-pill" title="Click to copy SKU" onclick="copyToClipboard('\${safeSku}', 'Copied SKU: \${safeSku}')">
                  SKU: \${p.sku || 'N/A'}
                </span>
              </div>
              <div class="price-row">
                <div>
                  <div class="price-label">Selling Price</div>
                  <div class="price-val">\${price}</div>
                </div>
              </div>
              <button class="btn-copy" onclick="copyToClipboard('\${safeCopyText}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy for Customer
              </button>
            </div>
          </div>
        \`;
      }).join('');
    }

    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (searchQuery.length > 0) {
        searchClear.classList.add('show');
      } else {
        searchClear.classList.remove('show');
      }
      filterAndRender();
    });

    renderStats();
    renderCategoryPills();
    filterAndRender();
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (err) {
    return new Response("Internal Server Error: " + String(err), { status: 500 });
  }
});
