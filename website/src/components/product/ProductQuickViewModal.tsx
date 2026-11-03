import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, MessageCircle, Check, ArrowRight, ShieldCheck, Truck, Calendar } from 'lucide-react';
import type { ProductGroup, Product } from '../../types/store';
import { STORE_INFO } from '../../data/storeData';
import { FormattedDescription } from './FormattedDescription';

interface ProductQuickViewModalProps {
  group: ProductGroup | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCalculator: (productName: string, price: number) => void;
}

export const ProductQuickViewModal: React.FC<ProductQuickViewModalProps> = ({
  group,
  isOpen,
  onClose,
  onOpenCalculator,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    if (group) {
      setSelectedProduct(group.baseProduct);
      setSelectedImageIndex(0);
    }
  }, [group]);

  if (!isOpen || !group || !selectedProduct) return null;

  const currentPrice = Number(selectedProduct.selling_price) || group.minPrice || 0;
  const currentImages =
    selectedProduct.images && selectedProduct.images.length > 0
      ? selectedProduct.images
      : group.baseProduct.images && group.baseProduct.images.length > 0
      ? group.baseProduct.images
      : ['/product.png'];

  const activeImage = currentImages[selectedImageIndex] || currentImages[0] || '/product.png';

  // Variant naming logic
  const getVariantLabel = (p: Product) => {
    if (p.name.includes(' - ')) {
      return p.name.split(' - ')[1].trim();
    }
    return p.name;
  };

  const prefilledText = `Hi NegoPinoy! Gusto ko pong mag-order ng "${group.baseName}"%0AVariation: ${getVariantLabel(selectedProduct)}%0APresyo: ₱${currentPrice.toLocaleString()}%0AMay available stock po ba at magkano ang COD delivery fee?`;
  const messengerUrl = `${STORE_INFO.messengerUrl}?text=${prefilledText}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card quick-view-modal" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="modal-close-btn" aria-label="Isara">
          <X size={20} />
        </button>

        <div className="quick-view-grid">
          {/* Left: Gallery */}
          <div className="quick-view-gallery">
            <div className="quick-view-main-image">
              <img
                src={activeImage}
                alt={selectedProduct.name}
                onError={(e) => {
                  e.currentTarget.src = '/product.png';
                }}
              />
            </div>

            {currentImages.length > 1 && (
              <div className="quick-view-thumbnails">
                {currentImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`thumb-btn ${selectedImageIndex === idx ? 'active' : ''}`}
                    onClick={() => setSelectedImageIndex(idx)}
                  >
                    <img
                      src={img}
                      alt={`Thumbnail ${idx + 1}`}
                      onError={(e) => {
                        e.currentTarget.src = '/product.png';
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Info & Variation Controls */}
          <div className="quick-view-details">
            <span className="quick-view-cat">{selectedProduct.category || 'NegoPinoy Quality'}</span>
            <h2 className="quick-view-title">{group.baseName}</h2>

            <div className="quick-view-price-row">
              <span className="quick-view-price">₱ {currentPrice.toLocaleString()}</span>
              <span className="quick-view-stock-badge">
                <Check size={14} /> Available on Hand
              </span>
            </div>

            {/* Variation Selection */}
            {group.variations.length > 1 && (
              <div className="quick-view-variations">
                <label className="variant-label">
                  Pumili ng Variation / Klase ({group.variations.length} pagpipilian):
                </label>
                <div className="variant-chips-row">
                  {group.variations.map((v) => {
                    const isSelected = v.id === selectedProduct.id;
                    const label = getVariantLabel(v);
                    const vPrice = Number(v.selling_price) || 0;

                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={`variant-chip-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedProduct(v);
                          setSelectedImageIndex(0);
                        }}
                      >
                        <span className="variant-name">{label}</span>
                        {vPrice > 0 && <span className="variant-price">₱{vPrice.toLocaleString()}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Installment / Lay-away Promo Banner */}
            <div className="quick-view-layaway-card">
              <div className="layaway-text">
                <Calendar size={18} className="text-gold" />
                <div>
                  <strong>Puwede itong hulugan o i-lay-away!</strong>
                  <p>As low as ₱{Math.round(currentPrice / 3).toLocaleString()}/buwan (0% interest)</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-open-calc"
                onClick={() => onOpenCalculator(selectedProduct.name, currentPrice)}
              >
                Compute
              </button>
            </div>

            {/* Description */}
            <div className="quick-view-desc">
              <FormattedDescription text={selectedProduct.description || ''} maxInitialLines={3} />
            </div>

            {/* Trust highlights */}
            <div className="quick-view-trust-row">
              <span className="trust-micro">
                <Truck size={14} /> Cash on Delivery
              </span>
              <span className="trust-micro">
                <ShieldCheck size={14} /> 7-Day Warranty
              </span>
            </div>

            {/* Actions */}
            <div className="quick-view-actions">
              <a
                href={messengerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-quick-order-messenger"
              >
                <MessageCircle size={18} />
                <span>Order via Messenger</span>
              </a>

              <Link
                to={`/product/${selectedProduct.id}`}
                className="btn-view-full-page"
                onClick={onClose}
              >
                <span>Buong Pahina</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
