import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PUBLIC_PRODUCT_COLUMNS } from '../lib/publicProductColumns';
import type { Product, ProductGroup, SortOption } from '../types/store';
import { ProductCard } from '../components/product/ProductCard';
import { ProductQuickViewModal } from '../components/product/ProductQuickViewModal';
import { InstallmentCalculatorModal } from '../components/product/InstallmentCalculatorModal';
import { ChevronRight, ArrowUpDown, ArrowLeft, Loader2, PackageX } from 'lucide-react';

export const CategoryPage: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const categoryName = name ? decodeURIComponent(name) : '';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('featured');

  // Modals
  const [quickViewGroup, setQuickViewGroup] = useState<ProductGroup | null>(null);
  const [calcState, setCalcState] = useState<{ isOpen: boolean; productName: string; price: number }>({
    isOpen: false,
    productName: '',
    price: 0,
  });

  useEffect(() => {
    async function fetchCategoryProducts() {
      if (!categoryName) return;
      try {
        setLoading(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const { data, error } = await supabase
          .from('products')
          .select(PUBLIC_PRODUCT_COLUMNS)
          .eq('category', categoryName)
          .limit(1000);

        if (error) {
          console.error('Error fetching category products:', error);
        } else if (data) {
          setProducts(data as Product[]);
        }
      } catch (err) {
        console.error('Failed to load category products:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCategoryProducts();
  }, [categoryName]);

  const productGroups = useMemo(() => {
    const groupMap = new Map<string, ProductGroup>();

    products.forEach((p) => {
      if (p.name === 'Kaisa 22cm Multicooker') return;

      const baseName = p.name ? p.name.split(' - ')[0].trim() : 'Unknown';
      const price = Number(p.selling_price) || 0;
      const onSale = Boolean(p.is_on_sale || (p.sale_price && Number(p.sale_price) < price));

      const existing = groupMap.get(baseName);
      if (existing) {
        existing.variations.push(p);
        if (price > 0 && price < existing.minPrice) existing.minPrice = price;
        if (price > existing.maxPrice) existing.maxPrice = price;
        if (onSale) existing.isOnSale = true;
      } else {
        groupMap.set(baseName, {
          baseName,
          baseProduct: p,
          variations: [p],
          minPrice: price,
          maxPrice: price,
          isOnSale: onSale,
          categories: [categoryName],
        });
      }
    });

    let result = Array.from(groupMap.values());

    switch (sortBy) {
      case 'price-asc':
        result.sort((a, b) => a.minPrice - b.minPrice);
        break;
      case 'price-desc':
        result.sort((a, b) => b.maxPrice - a.maxPrice);
        break;
      case 'name-asc':
        result.sort((a, b) => a.baseName.localeCompare(b.baseName));
        break;
      case 'sale-first':
        result.sort((a, b) => (b.isOnSale ? 1 : 0) - (a.isOnSale ? 1 : 0));
        break;
      default:
        break;
    }

    return result;
  }, [products, categoryName, sortBy]);

  const handleOpenCalc = (productName: string, price: number) => {
    setCalcState({ isOpen: true, productName, price });
  };

  return (
    <main className="category-page-main container">
      {/* Breadcrumb */}
      <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Tindahan</Link>
        <ChevronRight size={14} />
        <span className="breadcrumb-current">{categoryName}</span>
      </nav>

      <div className="catalog-header-bar">
        <div>
          <div className="cat-header-title-row">
            <Link to="/" className="btn-back-link" title="Bumalik sa Home">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="catalog-title">{categoryName}</h1>
          </div>
          <p className="catalog-subtitle">
            May {productGroups.length} mga subok na aytem sa kategoryang ito
          </p>
        </div>

        {/* Sort Controls */}
        <div className="sort-controls">
          <ArrowUpDown size={16} className="sort-icon" />
          <label htmlFor="cat-sort-select" className="sort-label">I-ayos ayon sa:</label>
          <select
            id="cat-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="sort-dropdown"
          >
            <option value="featured">Featured / Paborito</option>
            <option value="sale-first">Naka-Sale Muna 🔥</option>
            <option value="price-asc">Presyo: Mababa hanggang Mataas</option>
            <option value="price-desc">Presyo: Mataas hanggang Mababa</option>
            <option value="name-asc">Pangalan: A - Z</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="catalog-loading-state">
          <Loader2 className="spinner-icon" size={36} />
          <p>Ikinakarga ang mga produkto sa {categoryName}...</p>
        </div>
      ) : productGroups.length === 0 ? (
        <div className="catalog-empty-state">
          <PackageX size={48} className="text-muted" />
          <h3>Walang nahanap na produkto sa kategoryang ito</h3>
          <p>Maaari kang bumalik sa pangunahing pahina upang tingnan ang ibang kategorya.</p>
          <Link to="/" className="btn-reset-filters">
            Bumalik sa Lahat ng Produkto
          </Link>
        </div>
      ) : (
        <div className="products-grid">
          {productGroups.map((group) => (
            <ProductCard
              key={group.baseProduct.id}
              group={group}
              onQuickView={setQuickViewGroup}
              onOpenCalculator={handleOpenCalc}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <ProductQuickViewModal
        group={quickViewGroup}
        isOpen={Boolean(quickViewGroup)}
        onClose={() => setQuickViewGroup(null)}
        onOpenCalculator={handleOpenCalc}
      />

      <InstallmentCalculatorModal
        productName={calcState.productName}
        price={calcState.price}
        isOpen={calcState.isOpen}
        onClose={() => setCalcState((prev) => ({ ...prev, isOpen: false }))}
      />
    </main>
  );
};
