import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Header } from './c2/Header';
import { Footer } from './c2/Footer';
import { HomePage } from './c2/HomePage';
import { ProductPage } from './c2/ProductPage';
import { LegalPage } from './pages/LegalPage';
import './c2/c2.css';

// Old category links (/category/Cookware) now open the home page filtered.
function CategoryRedirect() {
  const { name } = useParams();
  return <Navigate to={name ? `/?cat=${encodeURIComponent(name)}` : '/'} replace />;
}

export function AppContent() {
  return (
    <div className="c2-root">
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/category/:name" element={<CategoryRedirect />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/privacy-policy" element={<LegalPage defaultTab="privacy" />} />
        <Route path="/terms-of-service" element={<LegalPage defaultTab="terms" />} />
        <Route path="/refund-policy" element={<LegalPage defaultTab="refund" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
