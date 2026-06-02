import { BrowserRouter as Router, Routes, Route, Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

function LiveBanner() {
  return (
    <div className="live-banner">
      <span>🔴 We are currently LIVE on Facebook!</span>
      <a href="https://www.facebook.com/NegoPinoyPH" target="_blank" rel="noopener noreferrer">
        Watch Now
      </a>
    </div>
  );
}

function Navbar({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <div className="header-wrapper">
      <nav className="navbar container">
        <Link to="/" className="logo" onClick={() => { setQuery(''); onSearch(''); }}>
          <img src="/logo.png" alt="NegoPinoy Logo" />
          NegoPinoy
        </Link>
        
        <form className="search-container" onSubmit={handleSearch}>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search for products, categories..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="search-button">Search</button>
        </form>

        <div>
          <a href="https://m.me/NegoPinoyPH" target="_blank" rel="noopener noreferrer" className="btn-messenger">
            Contact Us
          </a>
        </div>
      </nav>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h3>NegoPinoy</h3>
            <p className="mb-4">Empowering businesses and consumers with quality products.</p>
            <p style={{fontSize: '0.85rem', marginBottom: '1rem', color: '#64748b'}}>Official Website of <strong>Colev Elijah Enterprises</strong></p>
            <p><strong>Phone:</strong> 09171869554</p>
            <p><strong>Email:</strong> ornoskeneth@gmail.com</p>
          </div>
          <div>
            <h3>Legal</h3>
            <ul>
              <li><Link to="/privacy-policy">Privacy Policy</Link></li>
              <li><Link to="/terms-of-service">Terms of Service</Link></li>
              <li><Link to="/refund-policy">Return & Refund Policy</Link></li>
            </ul>
          </div>
          <div>
            <h3>Connect</h3>
            <ul>
              <li><a href="https://www.facebook.com/NegoPinoyPH" target="_blank" rel="noopener noreferrer">Facebook Page</a></li>
              <li><a href="https://m.me/NegoPinoyPH" target="_blank" rel="noopener noreferrer">Messenger Support</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} NegosyantengPinoy.ph (Colev Elijah Enterprises). All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function Home({ searchQuery, onCategorySelect }: { searchQuery: string, onCategorySelect: (cat: string) => void }) {
  const [productsByCategory, setProductsByCategory] = useState<Record<string, any[]>>({});
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      // Fetch up to 1000 items as mentioned by user
      const { data, error } = await supabase.from('products').select('*').limit(1000);
      if (error) {
        console.error("Error fetching products:", error);
      } else if (data) {
        const grouped: Record<string, any[]> = {};
        const categoriesSet = new Set<string>();

        data.forEach(p => {
          // Hide the placeholder item
          if (p.name === 'Kaisa 22cm Multicooker') return;

          let cat = p.category && p.category.trim() !== '' ? p.category : 'Other';
          if (cat === 'Uncategorized') cat = 'Other';
          
          categoriesSet.add(cat);

          // Group by base name
          const baseName = p.name ? p.name.split(' - ')[0].trim() : 'Unknown';

          if (!grouped[cat]) grouped[cat] = [];
          
          // Check if this baseName already exists in this category
          const existingGroup = grouped[cat].find(g => g.baseName === baseName);
          if (existingGroup) {
            existingGroup.variations.push(p);
            // Update min/max prices
            const price = Number(p.selling_price) || 0;
            if (price < existingGroup.minPrice) existingGroup.minPrice = price;
            if (price > existingGroup.maxPrice) existingGroup.maxPrice = price;
          } else {
            grouped[cat].push({
              baseName,
              baseProduct: p,
              variations: [p],
              minPrice: Number(p.selling_price) || 0,
              maxPrice: Number(p.selling_price) || 0
            });
          }
        });

        setProductsByCategory(grouped);
        // Sort categories, put 'Other' at the end
        setAllCategories(Array.from(categoriesSet).sort((a, b) => {
          if (a === 'Other') return 1;
          if (b === 'Other') return -1;
          return a.localeCompare(b);
        }));
      }
      setLoading(false);
    }
    fetchProducts();
  }, []);

  // Filter products based on search query
  const getFilteredCategories = () => {
    if (!searchQuery.trim()) return productsByCategory;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, any[]> = {};

    Object.keys(productsByCategory).forEach(cat => {
      // If the category name matches, show all in that category
      if (cat.toLowerCase().includes(query)) {
        filtered[cat] = productsByCategory[cat];
      } else {
        // Otherwise filter groups
        const matchingGroups = productsByCategory[cat].filter(g => 
          g.baseName.toLowerCase().includes(query) || 
          g.baseProduct.description?.toLowerCase().includes(query)
        );
        if (matchingGroups.length > 0) {
          filtered[cat] = matchingGroups;
        }
      }
    });

    return filtered;
  };

  const filteredData = getFilteredCategories();
  const hasResults = Object.keys(filteredData).length > 0;

  return (
    <main>
      {!searchQuery && (
        <section className="hero">
            <div className="hero-banner">
              <div>
                <h1>Mga Gamit sa Bahay na Subok at Maasahan</h1>
                <p style={{ marginTop: '1rem', color: '#475569', maxWidth: '600px', margin: '1rem auto 0' }}>
                  Sinisiguro namin na ang bawat item na binibili mo ay subok at de-kalidad. Dahil sa NegoPinoy, ang inyong investment para sa pamilya ay pangmatagalan.
                </p>
              </div>
            </div>
            
            {/* New USP Section */}
            <div className="usp-section container">
              <div className="usp-header">
                <h2>Bakit NegoPinoy ang Trusted Choice ng mga Wais na Misis?</h2>
                <p>Hindi lang kami basta nagbebenta, inaalagaan namin ang bawat customer natin.</p>
              </div>
              
              <div className="usp-grid">
                <div className="usp-card">
                  <div className="usp-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      <polyline points="9 12 11 14 15 10"/>
                    </svg>
                  </div>
                  <h3>Subok na De-Kalidad</h3>
                  <p>Hindi namin ibebenta sa inyo ang mga produkto na hindi namin mismo gagamitin. Sinasala naming maigi ang bawat item para makasiguro kayong high-quality at matibay ang makakarating sa inyong mga tahanan.</p>
                </div>
                
                <div className="usp-card">
                  <div className="usp-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2"/>
                      <line x1="2" y1="10" x2="22" y2="10"/>
                      <path d="M7 15h0"/>
                      <path d="M11 15h2"/>
                    </svg>
                  </div>
                  <h3>Installment at Lay-away</h3>
                  <p>Gusto mong hulugan? Walang problema! Kami ang kaisa-isang online seller na nag-ooffer ng flexible installment plans. At kung ayaw mo namang mangutang, may lay-away option din tayo para pasok pa rin sa budget.</p>
                </div>
                
                <div className="usp-card">
                  <div className="usp-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </div>
                  <h3>Alagang OFW at Lokal</h3>
                  <p>Mula sa mga masisipag nating OFW sa abroad na gustong padalhan ang pamilya, hanggang sa mga wais na nanay (at tatay!) dito sa Pilipinas—sinisiguro naming smooth at hassle-free ang bawat transaction.</p>
                </div>
              </div>
            </div>

            <div className="container">
            <div className="categories-row">
              {allCategories.map(cat => (
                <div key={cat} className="category-icon" onClick={() => onCategorySelect(cat)}>
                  <div className="category-circle">
                    {/* Just using the first letter as an icon placeholder for now */}
                    {cat.charAt(0).toUpperCase()}
                  </div>
                  <span className="category-name">{cat}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="products" className="container" style={{ padding: '2rem 0' }}>
        {searchQuery && (
          <h2 className="section-title">Search Results for "{searchQuery}"</h2>
        )}

        {loading ? (
          <p className="text-center">Loading products...</p>
        ) : !hasResults ? (
          <p className="text-center">No products found.</p>
        ) : (
          Object.keys(filteredData).sort().map(category => (
            <div key={category} style={{ marginBottom: '3rem' }}>
              {!searchQuery && <h2 className="section-title">{category}</h2>}
              
              <div className="products-grid">
                {filteredData[category].slice(0, searchQuery ? undefined : 8).map(g => (
                  <div key={g.baseProduct.id} className="product-card">
                    <Link to={`/product/${g.baseProduct.id}`} className="product-image" style={{display: 'block'}}>
                      <img 
                        src={g.baseProduct.images && g.baseProduct.images.length > 0 ? g.baseProduct.images[0] : "/product.png"} 
                        alt={g.baseName} 
                        onError={(e) => { e.currentTarget.src = "/product.png" }}
                      />
                    </Link>
                    <div className="product-content">
                      <Link to={`/product/${g.baseProduct.id}`} style={{display: 'block'}}>
                        <h3 className="product-title">{g.baseName}</h3>
                      </Link>
                      <p className="product-price">
                        {g.minPrice === g.maxPrice 
                          ? `₱ ${g.minPrice.toFixed(2)}` 
                          : `₱ ${g.minPrice.toFixed(2)} - ₱ ${g.maxPrice.toFixed(2)}`}
                      </p>
                      <p className="product-description">{g.baseProduct.description || 'No description available.'}</p>
                      <a 
                        href={`https://m.me/NegoPinoyPH?text=Hi!%20I%20want%20to%20inquire%20about%20the%20${encodeURIComponent(g.baseName)}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn-messenger"
                        style={{justifyContent: 'center', width: '100%', marginTop: 'auto'}}
                      >
                        Order via Messenger
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              
              {!searchQuery && filteredData[category].length > 8 && (
                <div className="category-footer">
                  <Link to={`/category/${encodeURIComponent(category)}`} className="btn-view-more">
                    View More in {category}
                  </Link>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}

// Category Page
function CategoryPage() {
  const { name } = useParams();
  const [groupedProducts, setGroupedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCategoryProducts() {
      if (!name) return;
      const { data } = await supabase.from('products').select('*').limit(1000);
      if (data) {
        const grouped: Record<string, any> = {};
        data.forEach(p => {
          let cat = p.category && p.category.trim() !== '' ? p.category : 'Other';
          if (cat === 'Uncategorized') cat = 'Other';
          if (cat !== name) return;
          
          if (p.name === 'Kaisa 22cm Multicooker') return;
          const baseName = p.name ? p.name.split(' - ')[0].trim() : 'Unknown';
          const existingGroup = grouped[baseName];
          if (existingGroup) {
            existingGroup.variations.push(p);
            const price = Number(p.selling_price) || 0;
            if (price < existingGroup.minPrice) existingGroup.minPrice = price;
            if (price > existingGroup.maxPrice) existingGroup.maxPrice = price;
          } else {
            grouped[baseName] = {
              baseName,
              baseProduct: p,
              variations: [p],
              minPrice: Number(p.selling_price) || 0,
              maxPrice: Number(p.selling_price) || 0
            };
          }
        });
        setGroupedProducts(Object.values(grouped));
      }
      setLoading(false);
    }
    fetchCategoryProducts();
  }, [name]);

  if (loading) return <div className="container" style={{padding: '4rem 0', minHeight: '60vh'}}><p className="text-center">Loading category...</p></div>;

  return (
    <main className="container" style={{ padding: '2rem 0', minHeight: '60vh' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link to="/" style={{ color: 'var(--primary-blue)', textDecoration: 'none', fontWeight: 600 }}>&larr; Back to Home</Link>
        <h1 style={{ margin: 0 }}>{name}</h1>
      </div>
      
      {groupedProducts.length === 0 ? (
        <p>No products found in this category.</p>
      ) : (
        <div className="products-grid">
          {groupedProducts.map(g => (
            <div key={g.baseProduct.id} className="product-card">
              <Link to={`/product/${g.baseProduct.id}`} className="product-image" style={{display: 'block'}}>
                <img 
                  src={g.baseProduct.images && g.baseProduct.images.length > 0 ? g.baseProduct.images[0] : "/product.png"} 
                  alt={g.baseName} 
                  onError={(e) => { e.currentTarget.src = "/product.png" }}
                />
              </Link>
              <div className="product-content">
                <Link to={`/product/${g.baseProduct.id}`} style={{display: 'block'}}>
                  <h3 className="product-title">{g.baseName}</h3>
                </Link>
                <p className="product-price">
                  {g.minPrice === g.maxPrice 
                    ? `₱ ${g.minPrice.toFixed(2)}` 
                    : `₱ ${g.minPrice.toFixed(2)} - ₱ ${g.maxPrice.toFixed(2)}`}
                </p>
                <p className="product-description">{g.baseProduct.description || 'No description available.'}</p>
                <a 
                  href={`https://m.me/NegoPinoyPH?text=Hi!%20I%20want%20to%20inquire%20about%20the%20${encodeURIComponent(g.baseName)}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-messenger"
                  style={{justifyContent: 'center', width: '100%', marginTop: 'auto'}}
                >
                  Order via Messenger
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

// Formatted Expandable Description
function FormattedDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  const renderText = () => {
    return text.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={idx} />;

      // If line contains a colon, make the first part bold
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex !== -1 && colonIndex < 60) {
        const title = trimmed.substring(0, colonIndex + 1);
        const rest = trimmed.substring(colonIndex + 1);
        return (
          <p key={idx} style={{ marginBottom: '0.75rem' }}>
            <strong style={{ color: 'var(--text-dark)' }}>{title}</strong>{rest}
          </p>
        );
      }

      return <p key={idx} style={{ marginBottom: '0.75rem' }}>{trimmed}</p>;
    });
  };

  return (
    <div className="description-container">
      <div className={`description-content ${expanded ? 'expanded' : 'collapsed'}`}>
        {renderText()}
      </div>
      <button className="read-more-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? '- View Less' : '+ Read More'}
      </button>
    </div>
  );
}

// Product Details Page
function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [variations, setVariations] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProductData() {
      if (!id) return;
      const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
      
      if (data) {
        setProduct(data);
        setSelectedProduct(data);
        
        // Fetch variations based on base name
        const baseName = data.name.split(' - ')[0].trim();
        const { data: varsData } = await supabase
          .from('products')
          .select('*')
          .ilike('name', `${baseName}%`);
        
        if (varsData && varsData.length > 0) {
          // Sort variations so they appear in a predictable order
          varsData.sort((a, b) => a.name.localeCompare(b.name));
          setVariations(varsData);
        } else {
          setVariations([data]);
        }
      } else if (error) {
        console.error("Error fetching product:", error);
      }
      setLoading(false);
    }
    fetchProductData();
  }, [id]);

  if (loading) {
    return <div className="container" style={{padding: '4rem 0', minHeight: '60vh'}}><p className="text-center">Loading product...</p></div>;
  }

  if (!product || !selectedProduct) {
    return <div className="container" style={{padding: '4rem 0', minHeight: '60vh'}}><h2 className="text-center">Product not found.</h2></div>;
  }

  const baseName = product.name.split(' - ')[0].trim();
  const hasVariations = variations.length > 1;

  return (
    <div className="product-details-container">
      <div className="product-details-image">
        <img 
          src={selectedProduct.images && selectedProduct.images.length > 0 ? selectedProduct.images[0] : "/product.png"} 
          alt={selectedProduct.name} 
          onError={(e) => { e.currentTarget.src = "/product.png" }}
        />
      </div>
      <div className="product-details-info">
        <h1 className="product-details-title">{baseName}</h1>
        <p className="product-details-price">
          {selectedProduct.selling_price ? `₱ ${Number(selectedProduct.selling_price).toFixed(2)}` : 'Price on request'}
        </p>

        {hasVariations && (
          <div className="variation-selector">
            <div className="variation-selector-title">Select Variation</div>
            <div className="variation-buttons">
              {variations.map(v => {
                const varName = v.name.split(' - ')[1]?.trim() || 'Standard';
                const isSelected = v.id === selectedProduct.id;
                return (
                  <button 
                    key={v.id} 
                    className={`variation-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedProduct(v)}
                  >
                    {varName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <FormattedDescription text={selectedProduct.description || 'No description available for this product.'} />
        
        <div className="product-details-actions">
          <a 
            href={`https://m.me/NegoPinoyPH?text=Hi!%20I%20want%20to%20order%20the%20${encodeURIComponent(selectedProduct.name)}`}
            target="_blank" 
            rel="noopener noreferrer"
            className="btn-messenger btn-large"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '8px'}}>
              <path d="M12 2C6.477 2 2 6.145 2 11.261C2 14.152 3.518 16.716 5.864 18.363V22L9.467 19.982C10.274 20.203 11.121 20.323 12 20.323C17.523 20.323 22 16.178 22 11.261C22 6.145 17.523 2 12 2ZM12.793 14.545L10.378 11.968L5.689 14.545L10.844 9.063L13.315 11.642L17.947 9.063L12.793 14.545Z" fill="white"/>
            </svg>
            Order via Messenger
          </a>
        </div>
      </div>
    </div>
  );
}

// Legal Pages
function PrivacyPolicy() {
  return (
    <div className="container" style={{padding: '4rem 1.5rem', maxWidth: '800px', margin: '0 auto', minHeight: '60vh'}}>
      <h1 className="mb-8 text-center" style={{color: 'var(--primary-blue)'}}>Privacy Policy</h1>
      <div style={{color: '#475569', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
        <p><strong>Effective Date:</strong> {new Date().toLocaleDateString()}</p>
        <p>At NegoPinoy, operated by <strong>Colev Elijah Enterprises</strong> ("we", "us", "our"), we respect your privacy and are committed to protecting the personal information you share with us. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website or interact with us through our Facebook Page and Messenger.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>1. Information We Collect</h3>
        <p>We may collect personal information such as your name, contact number, shipping address, and email address when you place an order with us via Messenger or sign up for our services. We also automatically collect some technical information (like IP addresses and browser types) to improve our website's performance.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>2. How We Use Your Information</h3>
        <p>We use your information solely to:</p>
        <ul style={{marginLeft: '2rem'}}>
          <li>Process and fulfill your orders.</li>
          <li>Communicate with you regarding your purchases or inquiries.</li>
          <li>Improve our website, products, and customer service.</li>
          <li>Send promotional messages (only if you have opted in).</li>
        </ul>

        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>3. Data Sharing</h3>
        <p>We do not sell, trade, or rent your personal information to third parties. We only share necessary details with trusted third-party service providers (such as couriers) to fulfill your orders.</p>

        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>4. Contact Us</h3>
        <p>If you have any questions about this Privacy Policy, please contact us at ornoskeneth@gmail.com or message our Facebook Page.</p>
      </div>
    </div>
  );
}

function TermsOfService() {
  return (
    <div className="container" style={{padding: '4rem 1.5rem', maxWidth: '800px', margin: '0 auto', minHeight: '60vh'}}>
      <h1 className="mb-8 text-center" style={{color: 'var(--primary-blue)'}}>Terms of Service</h1>
      <div style={{color: '#475569', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
        <p>Welcome to NegoPinoy, operated by <strong>Colev Elijah Enterprises</strong>. By accessing our website and ordering our products, you agree to comply with and be bound by the following terms and conditions.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>1. General Conditions</h3>
        <p>We reserve the right to refuse service to anyone for any reason at any time. You agree not to reproduce, duplicate, copy, sell, or exploit any portion of the Service, use of the Service, or access to the Service without express written permission by us.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>2. Products and Pricing</h3>
        <p>All prices and product availability are subject to change without notice. We make every effort to display the colors and images of our products as accurately as possible, but we cannot guarantee that your computer monitor's display will be completely accurate.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>3. Orders via Messenger</h3>
        <p>Currently, our primary mode of order processing is through Facebook Messenger. By clicking "Order via Messenger", you will be directed to our official page to finalize your transaction, provide shipping details, and arrange payment. We hold the right to cancel any order if we suspect fraudulent activity.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>4. Governing Law</h3>
        <p>These Terms of Service shall be governed by and construed in accordance with the laws of the Philippines.</p>
      </div>
    </div>
  );
}

function RefundPolicy() {
  return (
    <div className="container" style={{padding: '4rem 1.5rem', maxWidth: '800px', margin: '0 auto', minHeight: '60vh'}}>
      <h1 className="mb-8 text-center" style={{color: 'var(--primary-blue)'}}>Return & Refund Policy</h1>
      <div style={{color: '#475569', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
        <p>Thank you for shopping at NegoPinoy, operated by <strong>Colev Elijah Enterprises</strong>! We want to make sure you are completely satisfied with your purchase. If you are not entirely satisfied, we're here to help.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>1. Returns</h3>
        <p>You have seven (7) days to return an item from the date you received it. To be eligible for a return, your item must be unused, in the same condition that you received it, and in its original packaging. You must also have the receipt or proof of purchase.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>2. Refunds</h3>
        <p>Once we receive your item, we will inspect it and notify you that we have received your returned item. If your return is approved, we will initiate a refund to your original method of payment (or via agreed channels like GCash/Bank Transfer). You will receive the credit within a certain amount of days, depending on your card issuer's policies or the chosen payment method.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>3. Shipping Costs</h3>
        <p>You will be responsible for paying for your own shipping costs for returning your item. Shipping costs are non-refundable. If you receive a refund, the cost of return shipping will be deducted from your refund.</p>
        
        <h3 style={{color: 'var(--primary-blue)', marginTop: '1rem'}}>4. How to Initiate a Return</h3>
        <p>To initiate a return or request a refund, please send us a message directly on our Facebook Messenger page with your order details and photos of the item in question.</p>
      </div>
    </div>
  );
}

function AppContent() {
  const [searchQuery, setSearchQuery] = useState('');
  
  const handleCategorySelect = (cat: string) => {
    setSearchQuery(cat);
  };

  return (
    <>
      <LiveBanner />
      <Navbar onSearch={setSearchQuery} />
      <Routes>
        <Route path="/" element={<Home searchQuery={searchQuery} onCategorySelect={handleCategorySelect} />} />
        <Route path="/category/:name" element={<CategoryPage />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
      </Routes>
      <Footer />
    </>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
