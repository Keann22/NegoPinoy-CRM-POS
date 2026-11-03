import React from 'react';
import { Star, CheckCircle, Quote, ThumbsUp } from 'lucide-react';
import { TESTIMONIALS } from '../../data/storeData';

export const CustomerTestimonials: React.FC = () => {
  return (
    <section id="testimonials" className="testimonials-section">
      <div className="container">
        <div className="section-intro text-center">
          <span className="section-eyebrow">Mga Patunay ng Tiwala</span>
          <h2 className="section-heading">Kuwento ng mga Wais na Misis at Masisipag na Suki</h2>
          <p className="section-subheading">
            Tingnan kung bakit patuloy na nagtitiwala ang libu-libong pamilya at negosyante sa buong Pilipinas at abroad.
          </p>
        </div>

        <div className="testimonials-grid">
          {TESTIMONIALS.map((t) => (
            <div key={t.id} className="testimonial-card">
              <div className="testimonial-header">
                <div className="testimonial-stars">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} size={16} className="star-filled" fill="#f59e0b" color="#f59e0b" />
                  ))}
                </div>
                <Quote size={24} className="testimonial-quote-icon" />
              </div>

              <p className="testimonial-body">"{t.comment}"</p>

              {t.productName && (
                <div className="testimonial-product-tag">
                  <span>Biniling produkto:</span>
                  <strong>{t.productName}</strong>
                </div>
              )}

              <div className="testimonial-footer">
                <div className="testimonial-avatar-fallback">
                  {t.name.charAt(0)}
                </div>
                <div className="testimonial-author">
                  <div className="author-name-row">
                    <span className="author-name">{t.name}</span>
                    {t.verifiedPurchase && (
                      <span className="verified-badge" title="Verified Customer">
                        <CheckCircle size={13} /> Suki
                      </span>
                    )}
                  </div>
                  <span className="author-role">{t.role}</span>
                  <span className="author-location">{t.location}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Social Proof Trust Bar */}
        <div className="testimonials-trust-bar">
          <div className="trust-stat">
            <ThumbsUp size={20} className="text-blue" />
            <div>
              <strong>10,000+</strong>
              <p>Naipadalang Parcels Nationwide</p>
            </div>
          </div>
          <div className="trust-stat">
            <Star size={20} className="text-gold" />
            <div>
              <strong>4.9 / 5.0</strong>
              <p>Customer Satisfaction Rating</p>
            </div>
          </div>
          <div className="trust-stat">
            <CheckCircle size={20} className="text-green" />
            <div>
              <strong>100% Legit</strong>
              <p>Rehistradong Negosyo (Colev Elijah)</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
