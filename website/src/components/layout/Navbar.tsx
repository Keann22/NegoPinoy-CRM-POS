import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, X, MessageCircle, Phone, Menu, ShieldCheck, Truck } from 'lucide-react';
import { STORE_INFO } from '../../data/storeData';

interface NavbarProps {
  searchQuery: string;
  onSearch: (q: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ searchQuery, onSearch }) => {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(localQuery);
    navigate('/');
  };

  const handleClear = () => {
    setLocalQuery('');
    onSearch('');
  };

  return (
    <header className="header-wrapper">
      {/* Micro Trust & Info Bar */}
      <div className="top-micro-bar">
        <div className="container top-micro-inner">
          <div className="micro-left">
            <span className="micro-item">
              <Truck size={13} /> COD Nationwide
            </span>
            <span className="micro-divider">•</span>
            <span className="micro-item">
              <ShieldCheck size={13} /> 7-Day Guarantee
            </span>
            <span className="micro-divider">•</span>
            <span className="micro-item">
              Hulugan & Lay-away Available
            </span>
          </div>
          <div className="micro-right">
            <a href={`tel:${STORE_INFO.phone}`} className="micro-item hotline-link">
              <Phone size={13} /> Hotline: {STORE_INFO.phone}
            </a>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <nav className="navbar container">
        <Link
          to="/"
          className="logo-container"
          onClick={() => {
            setLocalQuery('');
            onSearch('');
          }}
        >
          <img src="/logo.png" alt="NegoPinoy Logo" className="brand-logo" />
          <div className="brand-text">
            <span className="brand-name">NegoPinoy</span>
            <span className="brand-tagline">Kasosyo sa Negosyo at Bahay</span>
          </div>
        </Link>

        {/* Global Search Bar */}
        <form className="search-form" onSubmit={handleSearchSubmit}>
          <div className="search-input-wrapper">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              className="search-input-field"
              placeholder="Maghanap ng produkto, kaldero, lutuan, gamit sa bahay..."
              value={localQuery}
              onChange={(e) => {
                setLocalQuery(e.target.value);
                onSearch(e.target.value);
              }}
            />
            {localQuery && (
              <button
                type="button"
                onClick={handleClear}
                className="search-clear-btn"
                aria-label="I-clear ang search"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button type="submit" className="search-submit-btn">
            Hanapin
          </button>
        </form>

        {/* Action Buttons */}
        <div className="nav-actions">
          <a
            href={STORE_INFO.messengerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-messenger-pill"
          >
            <MessageCircle size={18} />
            <span className="btn-messenger-label">Mag-usap sa Messenger</span>
          </a>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Buksan ang menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="mobile-drawer">
          <div className="mobile-drawer-content container">
            <div className="mobile-drawer-links">
              <Link
                to="/"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setLocalQuery('');
                  onSearch('');
                }}
              >
                Lahat ng Produkto
              </Link>
              <a
                href="#testimonials"
                onClick={() => setMobileMenuOpen(false)}
              >
                Patunay ng mga Suki (Reviews)
              </a>
              <a
                href="#faq"
                onClick={() => setMobileMenuOpen(false)}
              >
                Paano Umorder at FAQ
              </a>
              <Link
                to="/terms-of-service"
                onClick={() => setMobileMenuOpen(false)}
              >
                Mga Patakaran at Garantiya
              </Link>
            </div>
            <div className="mobile-drawer-cta">
              <a
                href={STORE_INFO.messengerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-messenger-full"
              >
                <MessageCircle size={18} />
                Order o Mag-inquire sa Messenger
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
