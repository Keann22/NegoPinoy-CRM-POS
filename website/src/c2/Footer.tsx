import { Link } from 'react-router-dom';
import { SHOP } from '../lib/shop';

export function Footer() {
  return (
    <footer className="c2-footer">
      <section className="c2-facts" aria-label="Paano bumili">
        <p><strong>Cash on Delivery.</strong> Bayaran pagdating ng order.</p>
        <p><strong>Hulugan at lay-away.</strong> Itanong sa amin ang terms.</p>
        <p><strong>Tunay na tindahan.</strong> {SHOP.address}.</p>
      </section>
      <div className="c2-footer-info">
        <span className="c2-footer-name">{SHOP.name}</span>
        <span>{SHOP.hours}</span>
        <a href={`tel:${SHOP.phone.replace(/-/g, '')}`}>{SHOP.phone}</a>
        <a href={SHOP.facebookUrl}>Facebook page</a>
      </div>
      <nav className="c2-footer-links" aria-label="Patakaran">
        <Link to="/privacy-policy">Privacy Policy</Link>
        <Link to="/terms-of-service">Terms of Service</Link>
        <Link to="/refund-policy">Refund Policy</Link>
      </nav>
    </footer>
  );
}
