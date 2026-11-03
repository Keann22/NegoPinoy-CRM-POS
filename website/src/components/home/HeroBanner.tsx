import React from 'react';
import { ShoppingBag, MessageCircle, Star, Sparkles, CheckCircle2, ShieldCheck } from 'lucide-react';
import { STORE_INFO } from '../../data/storeData';

interface HeroBannerProps {
  onBrowseClick: () => void;
  totalProductsCount: number;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ onBrowseClick, totalProductsCount }) => {
  return (
    <section className="hero-section">
      <div className="container hero-container">
        <div className="hero-content">
          <div className="hero-pill-badge">
            <Sparkles size={14} className="text-gold" />
            <span>Makatotohanang Kalidad para sa Pamilyang Pinoy</span>
          </div>

          <h1 className="hero-title">
            Mga Gamit sa Bahay at Negosyo na <span className="highlight-text">Subok at Maasahan</span>
          </h1>

          <p className="hero-subtitle">
            Mula sa mga de-kalidad na kitchenware at appliances hanggang sa mga pambahay. May <strong>Cash on Delivery</strong>, flexible na <strong>Installment</strong>, at <strong>Lay-away plans</strong> para pasok lagi sa budget mo!
          </p>

          <div className="hero-cta-group">
            <button
              onClick={onBrowseClick}
              className="btn-primary-hero"
            >
              <ShoppingBag size={18} />
              <span>Tingnan ang {totalProductsCount > 0 ? `${totalProductsCount}+ ` : ''}Produkto</span>
            </button>
            <a
              href={STORE_INFO.messengerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary-hero"
            >
              <MessageCircle size={18} />
              <span>Mag-inquire sa Messenger</span>
            </a>
          </div>

          <div className="hero-social-proof">
            <div className="stars-row">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={16} className="star-filled" fill="#f59e0b" color="#f59e0b" />
              ))}
            </div>
            <div className="proof-text">
              <strong>4.9 / 5 Rating</strong> mula sa libu-libong wais na misis at suki sa buong bansa
            </div>
          </div>
        </div>

        {/* Hero Visual Card */}
        <div className="hero-visual">
          <div className="hero-card-featured">
            <div className="hero-card-badge">Paborito ng Misis</div>
            <div className="hero-image-frame">
              <img
                src="/hero_banner.png"
                alt="NegoPinoy Pinakamagandang Produkto"
                className="hero-main-img"
                onError={(e) => {
                  e.currentTarget.src = '/product.png';
                }}
              />
            </div>
            <div className="hero-card-details">
              <div className="hero-card-header">
                <h3>Subok sa Tibay at Gaan Gamitin</h3>
                <span className="price-tag">Affordable & COD</span>
              </div>
              <ul className="hero-bullet-list">
                <li>
                  <CheckCircle2 size={16} className="bullet-icon" />
                  <span>100% Quality Inspected bago ipadala</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="bullet-icon" />
                  <span>Hulugan at Lay-away options available</span>
                </li>
                <li>
                  <ShieldCheck size={16} className="bullet-icon" />
                  <span>7-Day Replacement Warranty</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
