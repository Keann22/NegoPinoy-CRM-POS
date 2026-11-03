import React from 'react';
import { ShieldCheck, CalendarClock, Truck, HeartHandshake } from 'lucide-react';
import { TRUST_PILLARS } from '../../data/storeData';

export const TrustFeatures: React.FC = () => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShieldCheck':
        return <ShieldCheck size={28} className="trust-icon-svg" />;
      case 'CalendarClock':
        return <CalendarClock size={28} className="trust-icon-svg" />;
      case 'Truck':
        return <Truck size={28} className="trust-icon-svg" />;
      case 'HeartHandshake':
        return <HeartHandshake size={28} className="trust-icon-svg" />;
      default:
        return <ShieldCheck size={28} className="trust-icon-svg" />;
    }
  };

  return (
    <section className="trust-features-section">
      <div className="container">
        <div className="section-intro text-center">
          <span className="section-eyebrow">Bakit NegoPinoy?</span>
          <h2 className="section-heading">Tiwala at Kaginhawahan Para sa Pamilyang Pilipino</h2>
          <p className="section-subheading">
            Hindi lang kami nagbebenta; sinisiguro naming sulit ang bawat sentimo ng inyong pinagpaguran.
          </p>
        </div>

        <div className="trust-grid">
          {TRUST_PILLARS.map((pillar, idx) => (
            <div key={idx} className="trust-card">
              <div className="trust-card-header">
                <div className="trust-icon-box">{getIcon(pillar.icon)}</div>
                <span className="trust-badge-pill">{pillar.badge}</span>
              </div>
              <h3 className="trust-card-title">{pillar.title}</h3>
              <p className="trust-card-desc">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
