import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PUBLIC_PRODUCT_COLUMNS } from '../lib/publicProductColumns';
import type { Product, ProductGroup } from '../types/store';
import { STORE_INFO } from '../data/storeData';
import { FormattedDescription } from '../components/product/FormattedDescription';
import { InstallmentCalculatorModal } from '../components/product/InstallmentCalculatorModal';
import { ProductCard } from '../components/product/ProductCard';
import { ProductQuickViewModal } from '../components/product/ProductQuickViewModal';
import {
  ChevronRight,
  MessageCircle,
  Truck,
  ShieldCheck,
  Calendar,
  CheckCircle2,
  Share2,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export const ProductDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [variations, setVariations] = useState<Product[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [relatedProducts, setRelatedProducts] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Calculator modal
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [quickViewGroup, setQuickViewGroup] = useState<ProductGroup | null>(null);

  useEffect(() => {
    async function fetchProductAndVariations() {
      if (!id) return;
      try {
        setLoading(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Fetch single product
        const { data, error } = await supabase
          .from('products')
          .select(PUBLIC_PRODUCT_COLUMNS)
          .eq('id', id)
          .single();

        if (error || !data) {
          console.error('Failed to load product:', error);
          setLoading(false);
          return;
        }

        const current = data as Product;
        setProduct(current);
        setSelectedVariant(current);
        setSelectedImageIndex(0);

        // Fetch sibling variations by baseName prefix
        const baseName = current.name ? current.name.split(' - ')[0].trim() : '';
        if (baseName) {
          const { data: varsData } = await supabase
            .from('products')
            .select(PUBLIC_PRODUCT_COLUMNS)
            .ilike('name', `${baseName}%`);

          if (varsData && varsData.length > 0) {
            varsData.sort((a, b) => a.name.localeCompare(b.name));
            setVariations(varsData as Product[]);
          } else {
            setVariations([current]);
          }
        }

        // Fetch related products from same category
        if (current.category) {
          const { data: relData } = await supabase
            .from('products')
            .select(PUBLIC_PRODUCT_COLUMNS)
            .eq('category', current.category)
            .neq('id', id)
            .limit(4);

          if (relData && relData.length > 0) {
            const relGroups: ProductGroup[] = (relData as Product[]).map((rp) => ({
              baseName: rp.name.split(' - ')[0].trim(),
              baseProduct: rp,
              variations: [rp],
              minPrice: Number(rp.selling_price) || 0,
              maxPrice: Number(rp.selling_price) || 0,
              isOnSale: Boolean(rp.is_on_sale),
              categories: [rp.category || 'Other'],
            }));
            setRelatedProducts(relGroups);
          }
        }
      } catch (err) {
        console.error('Error fetching details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProductAndVariations();
  }, [id]);

  if (loading) {
    return (
      <div className="product-details-loading container">
        <Loader2 className="spinner-icon" size={40} />
        <p>Ikinakarga ang mga detalye ng produkto...</p>
      </div>
    );
  }

  if (!product || !selectedVariant) {
    return (
      <div className="product-details-empty container">
        <AlertCircle size={44} className="text-red" />
        <h2>Paumanhin, hindi mahanap ang produkto</h2>
        <p>Maaaring nabago o naalis na ang item na ito sa aming tindahan.</p>
        <Link to="/" className="btn-back-home">
          <ArrowLeft size={16} />
          <span>Bumalik sa Tindahan</span>
        </Link>
      </div>
    );
  }

  const baseName = product.name.split(' - ')[0].trim();
  const currentPrice = Number(selectedVariant.selling_price) || 0;
  const originalPrice = selectedVariant.sale_price ? Number(selectedVariant.selling_price) : null;
  const isSale = Boolean(selectedVariant.is_on_sale || (selectedVariant.sale_price && Number(selectedVariant.sale_price) < currentPrice));

  const images =
    selectedVariant.images && selectedVariant.images.length > 0
      ? selectedVariant.images
      : product.images && product.images.length > 0
      ? product.images
      : ['/product.png'];

  const activeImage = images[selectedImageIndex] || images[0] || '/product.png';

  const getVariantLabel = (p: Product) => {
    if (p.name.includes(' - ')) {
      return p.name.split(' - ')[1].trim();
    }
    return p.name;
  };

  const currentVariantLabel = getVariantLabel(selectedVariant);
  const estMonthly = Math.round(currentPrice / 3);

  // Messenger prefilled inquiry
  const prefilledText = `Hi NegoPinoy! Gusto ko pong umorder nito:%0AProdukto: ${baseName}%0AVariant: ${currentVariantLabel}%0APresyo: ₱${currentPrice.toLocaleString()}%0AMay stock pa po ba? Paano po ang delivery via Cash on Delivery (COD)?`;
  const messengerUrl = `${STORE_INFO.messengerUrl}?text=${prefilledText}`;

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <main className="product-page-main container">
      {/* Breadcrumb Navigation */}
      <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Tindahan</Link>
        <ChevronRight size={14} />
        {product.category && (
          <>
            <Link to={`/category/${encodeURIComponent(product.category)}`}>
              {product.category}
            </Link>
            <ChevronRight size={14} />
          </>
        )}
        <span className="breadcrumb-current">{baseName}</span>
      </nav>

      {/* Main PDP Grid */}
      <div className="pdp-grid">
        {/* Gallery Section */}
        <div className="pdp-gallery-col">
          <div className="pdp-main-image-box">
            <img
              src={activeImage}
              alt={selectedVariant.name}
              className="pdp-main-img"
              onError={(e) => {
                e.currentTarget.src = '/product.png';
              }}
            />
            {isSale && <span className="pdp-badge-sale">SALE 🔥</span>}
          </div>

          {images.length > 1 && (
            <div className="pdp-thumbs-row">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`pdp-thumb-btn ${selectedImageIndex === idx ? 'active' : ''}`}
                  onClick={() => setSelectedImageIndex(idx)}
                >
                  <img
                    src={img}
                    alt={`View ${idx + 1}`}
                    onError={(e) => {
                      e.currentTarget.src = '/product.png';
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Details & Actions */}
        <div className="pdp-info-col">
          <div className="pdp-header">
            <span className="pdp-cat-pill">{product.category || 'Home & Negosyo'}</span>
            <h1 className="pdp-title">{baseName}</h1>

            <div className="pdp-price-row">
              <span className="pdp-price">₱ {currentPrice.toLocaleString()}</span>
              {originalPrice && originalPrice > currentPrice && (
                <span className="pdp-strikethrough">₱ {originalPrice.toLocaleString()}</span>
              )}
              <span className="pdp-stock-tag">
                <CheckCircle2 size={15} /> May Stock (Ready to Ship)
              </span>
            </div>
          </div>

          {/* Lay-away / Installment Feature Card */}
          <div className="pdp-layaway-card">
            <div className="layaway-details">
              <Calendar size={20} className="text-gold" />
              <div>
                <strong>Available on Installment & Lay-away!</strong>
                <p>Hulugan mula <strong>₱{estMonthly.toLocaleString()} / buwan</strong> (0% Interest)</p>
              </div>
            </div>
            <button
              type="button"
              className="btn-pdp-calc"
              onClick={() => setIsCalcOpen(true)}
            >
              Kwentahin ang Hulog
            </button>
          </div>

          {/* Variation Selector */}
          {variations.length > 1 && (
            <div className="pdp-variants-section">
              <label className="variant-label">
                Piliin ang Variation: <strong>{currentVariantLabel}</strong>
              </label>
              <div className="pdp-variant-chips">
                {variations.map((v) => {
                  const isSelected = v.id === selectedVariant.id;
                  const label = getVariantLabel(v);
                  const vPrice = Number(v.selling_price) || 0;

                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`pdp-variant-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedVariant(v);
                        setSelectedImageIndex(0);
                      }}
                    >
                      <span className="v-label">{label}</span>
                      {vPrice > 0 && <span className="v-price">₱{vPrice.toLocaleString()}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTAs */}
          <div className="pdp-actions-area">
            <a
              href={messengerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-pdp-order-messenger"
            >
              <MessageCircle size={22} />
              <span>Mag-order via Messenger (Cash on Delivery)</span>
            </a>

            <button
              type="button"
              onClick={handleShare}
              className="btn-pdp-share"
              title="Kopyahin ang link ng produkto"
            >
              <Share2 size={18} />
              <span>{copiedLink ? 'Na-kopya ang Link! 👍' : 'I-share sa Pamilya'}</span>
            </button>
          </div>

          {/* Trust Guarantees */}
          <div className="pdp-guarantee-box">
            <div className="guarantee-item">
              <Truck size={18} className="text-blue" />
              <div>
                <strong>Cash on Delivery (COD) Nationwide</strong>
                <p>Hawakan at buksan ang parcel bago magbayad kay rider.</p>
              </div>
            </div>
            <div className="guarantee-item">
              <ShieldCheck size={18} className="text-gold" />
              <div>
                <strong>7-Day Replacement Warranty</strong>
                <p>Opisyal na garantiya ng Colev Elijah Enterprises.</p>
              </div>
            </div>
          </div>

          {/* Description & Specifications */}
          <div className="pdp-description-section">
            <h3 className="section-title-sm">Deskripsyon & Detalye ng Produkto</h3>
            <FormattedDescription text={selectedVariant.description || ''} maxInitialLines={6} />
          </div>
        </div>
      </div>

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <section className="pdp-related-section">
          <h2 className="related-heading">Iba pang Kaugnay na Produkto sa {product.category}</h2>
          <div className="products-grid">
            {relatedProducts.map((grp) => (
              <ProductCard
                key={grp.baseProduct.id}
                group={grp}
                onQuickView={setQuickViewGroup}
                onOpenCalculator={() => {
                  setSelectedVariant(grp.baseProduct);
                  setIsCalcOpen(true);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Calculator Modal */}
      <InstallmentCalculatorModal
        productName={baseName}
        price={currentPrice}
        isOpen={isCalcOpen}
        onClose={() => setIsCalcOpen(false)}
      />

      {/* Quick View Modal for Related Products */}
      <ProductQuickViewModal
        group={quickViewGroup}
        isOpen={Boolean(quickViewGroup)}
        onClose={() => setQuickViewGroup(null)}
        onOpenCalculator={() => {
          setIsCalcOpen(true);
        }}
      />
    </main>
  );
};
