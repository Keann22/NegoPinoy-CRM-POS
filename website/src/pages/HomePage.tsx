import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PUBLIC_PRODUCT_COLUMNS } from '../lib/publicProductColumns';
import type { Product, ProductGroup, SortOption } from '../types/store';
import { HeroBanner } from '../components/home/HeroBanner';
import { TrustFeatures } from '../components/home/TrustFeatures';
import { CategoryChips } from '../components/home/CategoryChips';
import { CustomerTestimonials } from '../components/home/CustomerTestimonials';
import { FaqSection } from '../components/home/FaqSection';
import { ProductCard } from '../components/product/ProductCard';
import { ProductQuickViewModal } from '../components/product/ProductQuickViewModal';
import { InstallmentCalculatorModal } from '../components/product/InstallmentCalculatorModal';
import { ArrowUpDown, PackageX, Loader2 } from 'lucide-react';

interface HomePageProps {
  searchQuery: string;
}

export const HomePage: React.FC<HomePageProps> = ({ searchQuery }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('featured');

  // Modals state
  const [quickViewGroup, setQuickViewGroup] = useState<ProductGroup | null>(null);
  const [calcState, setCalcState] = useState<{ isOpen: boolean; productName: string; price: number }>({
    isOpen: false,
    productName: '',
    price: 0,
  });

  const catalogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true);
        const { data, error } = await supabase.from('products').select(PUBLIC_PRODUCT_COLUMNS).limit(1000);
        if (error) {
          console.error('Error fetching products from Supabase:', error);
        } else if (data) {
          setProducts(data as Product[]);
        }
      } catch (err) {
        console.error('Failed to load products:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  // Group products by baseName
  const { productGroups, categories, categoryCounts, totalCount, saleCount } = useMemo(() => {
    const groupMap = new Map<string, ProductGroup>();
    const catCounts: Record<string, number> = {};
    const catSet = new Set<string>();
    let saleCounter = 0;

    products.forEach((p) => {
      // Skip known placeholders
      if (p.name === 'Kaisa 22cm Multicooker') return;

      const cat = p.category && p.category.trim() !== '' ? p.category.trim() : 'Other';
      catSet.add(cat);
      catCounts[cat] = (catCounts[cat] || 0) + 1;

      const baseName = p.name ? p.name.split(' - ')[0].trim() : 'Unknown';
      const price = Number(p.selling_price) || 0;
      const onSale = Boolean(p.is_on_sale || (p.sale_price && Number(p.sale_price) < price));

      if (onSale) saleCounter++;

      const existing = groupMap.get(baseName);
      if (existing) {
        existing.variations.push(p);
        if (price > 0 && price < existing.minPrice) existing.minPrice = price;
        if (price > existing.maxPrice) existing.maxPrice = price;
        if (onSale) existing.isOnSale = true;
        if (!existing.categories.includes(cat)) existing.categories.push(cat);
      } else {
        groupMap.set(baseName, {
          baseName,
          baseProduct: p,
          variations: [p],
          minPrice: price,
          maxPrice: price,
          isOnSale: onSale,
          categories: [cat],
        });
      }
    });

    const sortedCats = Array.from(catSet).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });

    return {
      productGroups: Array.from(groupMap.values()),
      categories: sortedCats,
      categoryCounts: catCounts,
      totalCount: groupMap.size,
      saleCount: saleCounter,
    };
  }, [products]);

  // Filter & Sort
  const filteredGroups = useMemo(() => {
    let result = [...productGroups];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (g) =>
          g.baseName.toLowerCase().includes(q) ||
          g.categories.some((c) => c.toLowerCase().includes(q)) ||
          g.baseProduct.description?.toLowerCase().includes(q) ||
          g.variations.some((v) => v.name.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory === 'sale') {
      result = result.filter((g) => g.isOnSale);
    } else if (selectedCategory !== 'all') {
      result = result.filter((g) => g.categories.includes(selectedCategory));
    }

    // Sort
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
        // featured: keep default DB sort
        break;
    }

    return result;
  }, [productGroups, searchQuery, selectedCategory, sortBy]);

  const scrollToCatalog = () => {
    catalogRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleOpenCalc = (productName: string, price: number) => {
    setCalcState({ isOpen: true, productName, price });
  };

  return (
    <main className="store-main">
      {/* Hero Section (only when not searching) */}
      {!searchQuery && (
        <>
          <HeroBanner
            onBrowseClick={scrollToCatalog}
            totalProductsCount={totalCount}
          />
          <TrustFeatures />
        </>
      )}

      {/* Catalog & Products Showcase */}
      <section ref={catalogRef} id="catalog" className="catalog-section container">
        <div className="catalog-header-bar">
          <div>
            <h2 className="catalog-title">
              {searchQuery ? (
                <>Resulta para: <span className="highlight-query">"{searchQuery}"</span></>
              ) : selectedCategory === 'sale' ? (
                'Mga Produktong Naka-Sale 🔥'
              ) : selectedCategory === 'all' ? (
                'Koleksyon ng mga Produkto'
              ) : (
                selectedCategory
              )}
            </h2>
            <p className="catalog-subtitle">
              May {filteredGroups.length} items na handang i-ship via Cash on Delivery
            </p>
          </div>

          {/* Sort Controls */}
          <div className="sort-controls">
            <ArrowUpDown size={16} className="sort-icon" />
            <label htmlFor="sort-select" className="sort-label">I-ayos ayon sa:</label>
            <select
              id="sort-select"
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

        {/* Category Chips Filter Bar */}
        <CategoryChips
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          categoryCounts={categoryCounts}
          totalCount={totalCount}
          saleCount={saleCount}
        />

        {/* Products Grid / Loading / Empty States */}
        {loading ? (
          <div className="catalog-loading-state">
            <Loader2 className="spinner-icon" size={36} />
            <p>Ikinakarga ang mga de-kalidad na produkto...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="catalog-empty-state">
            <PackageX size={48} className="text-muted" />
            <h3>Walang nahanap na produkto</h3>
            <p>Subukang baguhin ang iyong search o pumili ng ibang kategorya.</p>
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className="btn-reset-filters"
            >
              Ipakita ang Lahat ng Produkto
            </button>
          </div>
        ) : (
          <div className="products-grid">
            {filteredGroups.map((group) => (
              <ProductCard
                key={group.baseProduct.id}
                group={group}
                onQuickView={setQuickViewGroup}
                onOpenCalculator={handleOpenCalc}
              />
            ))}
          </div>
        )}
      </section>

      {/* Customer Testimonials & Reviews */}
      <CustomerTestimonials />

      {/* Step-by-Step Order Guide & FAQs */}
      <FaqSection />

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
