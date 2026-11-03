import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Eye, Tag, Calendar, Layers } from 'lucide-react';
import type { ProductGroup } from '../../types/store';
import { STORE_INFO } from '../../data/storeData';

interface ProductCardProps {
  group: ProductGroup;
  onQuickView: (group: ProductGroup) => void;
  onOpenCalculator: (productName: string, price: number) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  group,
  onQuickView,
  onOpenCalculator,
}) => {
  const { baseName, baseProduct, variations, minPrice, maxPrice, isOnSale } = group;

  const displayImage =
    baseProduct.images && baseProduct.images.length > 0 && baseProduct.images[0]
      ? baseProduct.images[0]
      : '/product.png';

  const variationCount = variations.length;
  const hasMultiplePrices = minPrice !== maxPrice;

  // Calculate monthly installment estimate (e.g. 3 months lay-away)
  const lowestPrice = minPrice > 0 ? minPrice : 1000;
  const estMonthly = Math.round(lowestPrice / 3);

  // Messenger prefill message
  const inquiryText = `Hi NegoPinoy! Interesado po ako umorder ng "${baseName}".%0AMayroon pa po bang available stocks? Magkano po ang shipping via Cash on Delivery (COD)?`;
  const messengerUrl = `${STORE_INFO.messengerUrl}?text=${inquiryText}`;

  return (
    <div className="product-card">
      {/* Image Thumbnail & Badges */}
      <div className="product-card-media">
        <Link to={`/product/${baseProduct.id}`} className="product-image-link">
          <img
            src={displayImage}
            alt={baseName}
            className="product-card-img"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = '/product.png';
            }}
          />
        </Link>

        {/* Floating Badges */}
        <div className="product-badges-container">
          {isOnSale && (
            <span className="badge-pill badge-sale">
              <Tag size={12} /> SALE
            </span>
          )}
          <span className="badge-pill badge-cod">COD Available</span>
        </div>

        {/* Quick View Button on Image */}
        <button
          type="button"
          onClick={() => onQuickView(group)}
          className="btn-quick-view-overlay"
          aria-label="Silipin ang produkto"
        >
          <Eye size={15} />
          <span>Quick View</span>
        </button>
      </div>

      {/* Card Content */}
      <div className="product-card-body">
        {/* Category & Variations Count */}
        <div className="product-card-meta">
          <span className="product-category-tag">
            {baseProduct.category || 'Home & Negosyo'}
          </span>
          {variationCount > 1 && (
            <span className="variation-count-pill" title={`${variationCount} choices available`}>
              <Layers size={11} /> {variationCount} Variations
            </span>
          )}
        </div>

        {/* Title */}
        <Link to={`/product/${baseProduct.id}`} className="product-title-link">
          <h3 className="product-card-title">{baseName}</h3>
        </Link>

        {/* Price Display */}
        <div className="product-card-pricing">
          <div className="price-main">
            {hasMultiplePrices ? (
              <span className="price-range">
                ₱ {minPrice.toLocaleString()} – ₱ {maxPrice.toLocaleString()}
              </span>
            ) : (
              <span className="price-single">
                ₱ {minPrice > 0 ? minPrice.toLocaleString() : 'Price on request'}
              </span>
            )}
          </div>

          {/* Lay-away badge / button */}
          <button
            type="button"
            onClick={() => onOpenCalculator(baseName, lowestPrice)}
            className="installment-calc-pill"
            title="Tingnan ang Lay-away & Hulugan terms"
          >
            <Calendar size={12} />
            <span>o mula ₱{estMonthly.toLocaleString()}/mo hulugan</span>
          </button>
        </div>

        {/* Description snippet */}
        <p className="product-card-snippet">
          {baseProduct.description
            ? baseProduct.description.slice(0, 85) + (baseProduct.description.length > 85 ? '...' : '')
            : 'Subok at de-kalidad na produkto mula sa NegoPinoy.'}
        </p>

        {/* Action Buttons */}
        <div className="product-card-actions">
          <Link
            to={`/product/${baseProduct.id}`}
            className="btn-view-details"
          >
            Tingnan ang Detalye
          </Link>
          <a
            href={messengerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-order-messenger"
            aria-label={`Order ${baseName} via Messenger`}
          >
            <MessageCircle size={16} />
            <span>Order sa Messenger</span>
          </a>
        </div>
      </div>
    </div>
  );
};
