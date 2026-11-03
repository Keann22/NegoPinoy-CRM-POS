import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, MessageCircle, Clock, ShieldCheck, Heart } from 'lucide-react';
import { STORE_INFO } from '../../data/storeData';

export const Footer: React.FC = () => {
  return (
    <footer className="site-footer">
      {/* Pre-footer trust banner */}
      <div className="pre-footer-banner">
        <div className="container pre-footer-inner">
          <div className="pre-footer-pill">
            <ShieldCheck size={20} className="text-gold" />
            <div>
              <strong>100% Legit at Rehistrado</strong>
              <p>Opisyal na negosyo ng {STORE_INFO.legalName}</p>
            </div>
          </div>
          <div className="pre-footer-pill">
            <Heart size={20} className="text-red" />
            <div>
              <strong>Tiwala ng Libu-libong Misis</strong>
              <p>Mula Luzon, Visayas, hanggang Mindanao</p>
            </div>
          </div>
          <div className="pre-footer-pill">
            <MessageCircle size={20} className="text-blue" />
            <div>
              <strong>Mabilis na Suporta</strong>
              <p>Aktibong sumasagot sa Facebook Messenger</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container footer-main">
        <div className="footer-grid">
          {/* Column 1: Brand Info */}
          <div className="footer-col brand-col">
            <div className="footer-logo-row">
              <img src="/logo.png" alt="NegoPinoy Logo" className="footer-logo-img" />
              <span className="footer-brand-title">{STORE_INFO.name}</span>
            </div>
            <p className="footer-desc">
              Sinisiguro namin na ang bawat item na binibili mo ay subok, de-kalidad, at abot-kaya para sa tahanan at lumalaking negosyo.
            </p>
            <div className="footer-business-badge">
              <span>Opisyal na Website ng</span>
              <strong>{STORE_INFO.legalName}</strong>
            </div>
          </div>

          {/* Column 2: Contact Info */}
          <div className="footer-col">
            <h3 className="footer-heading">Makipag-ugnayan</h3>
            <ul className="footer-contact-list">
              <li>
                <MapPin size={16} className="footer-icon" />
                <span>{STORE_INFO.address}</span>
              </li>
              <li>
                <Phone size={16} className="footer-icon" />
                <a href={`tel:${STORE_INFO.phone}`}>{STORE_INFO.phone}</a>
              </li>
              <li>
                <Mail size={16} className="footer-icon" />
                <a href={`mailto:${STORE_INFO.email}`}>{STORE_INFO.email}</a>
              </li>
              <li>
                <Clock size={16} className="footer-icon" />
                <span>{STORE_INFO.hours}</span>
              </li>
            </ul>
          </div>

          {/* Column 3: Customer Care & Legal */}
          <div className="footer-col">
            <h3 className="footer-heading">Serbisyo & Patakaran</h3>
            <ul className="footer-links-list">
              <li>
                <Link to="/refund-policy">Return & Refund Policy (7-Day Warranty)</Link>
              </li>
              <li>
                <Link to="/terms-of-service">Terms of Service</Link>
              </li>
              <li>
                <Link to="/privacy-policy">Privacy Policy</Link>
              </li>
              <li>
                <a href="#faq">Mga Madalas Itanong (FAQ)</a>
              </li>
              <li>
                <a href="#testimonials">Patunay ng mga Suki (Reviews)</a>
              </li>
            </ul>
          </div>

          {/* Column 4: Social & Connect */}
          <div className="footer-col">
            <h3 className="footer-heading">Subaybayan Kami</h3>
            <p className="footer-social-intro">
              Sumali sa aming Facebook Live para sa mga bawas-presyo at exclusive giveaways linggo-linggo!
            </p>
            <div className="footer-social-buttons">
              <a
                href={STORE_INFO.facebookPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-btn fb-btn"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                <span>Facebook Page</span>
              </a>
              <a
                href={STORE_INFO.messengerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-btn msg-btn"
              >
                <MessageCircle size={18} />
                <span>Messenger Chat</span>
              </a>
            </div>
            <div className="payment-badges-row">
              <span className="payment-chip">COD Available</span>
              <span className="payment-chip">GCash</span>
              <span className="payment-chip">Bank Transfer</span>
              <span className="payment-chip">Lay-away</span>
            </div>
          </div>
        </div>

        {/* Footer Bottom Bar */}
        <div className="footer-bottom">
          <p>
            &copy; {new Date().getFullYear()} {STORE_INFO.name} ({STORE_INFO.legalName}). All rights reserved.
          </p>
          <p className="footer-bottom-note">
            Ang paboritong kasosyo ng mga Wais na Misis at Masisipag na Pinoy.
          </p>
        </div>
      </div>
    </footer>
  );
};
