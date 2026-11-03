import React, { useState } from 'react';
import { Radio, ExternalLink, X } from 'lucide-react';

export const LiveBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="live-banner">
      <div className="live-banner-content">
        <span className="live-badge">
          <span className="live-pulse" />
          <Radio size={14} className="live-icon" />
          LIVE SELLING
        </span>
        <span className="live-banner-text">
          Kasulukuyan kaming <strong>LIVE sa Facebook</strong>! Manood para sa exclusive live discounts, bundles, at freebies.
        </span>
        <a
          href="https://www.facebook.com/NegoPinoyPH"
          target="_blank"
          rel="noopener noreferrer"
          className="live-banner-link"
        >
          <span>Panoorin Ngayon</span>
          <ExternalLink size={13} />
        </a>
      </div>
      <button
        onClick={() => setIsVisible(false)}
        className="live-banner-close"
        aria-label="Isara ang banner"
      >
        <X size={15} />
      </button>
    </div>
  );
};
