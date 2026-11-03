import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { categoriesOf, categoryLabel, matchesSearch, type CatalogItem } from '../lib/catalog';
import { useCatalog } from '../lib/useCatalog';
import { peso, priceRange, SHOP } from '../lib/shop';
import { CategoryNav } from './CategoryNav';
import { ProductTile } from './ProductTile';
import { ArrowIcon } from './Icons';

const PAGE = 24;

/** The product at the top of the home page. Featured in the CRM first; else a good in-stock one. */
function pickFeatured(items: CatalogItem[]): CatalogItem | undefined {
  const ready = items.filter((i) => i.inStock && i.images.length);
  return ready.find((i) => i.featured) ?? ready.find((i) => i.sale) ?? ready.find((i) => i.variants.length > 1) ?? ready[0];
}

export function HomePage() {
  const { items, error, loading } = useCatalog();
  const [params] = useSearchParams();
  const cat = params.get('cat') ?? '';
  const q = params.get('q') ?? '';
  const [shown, setShown] = useState(PAGE);

  useEffect(() => setShown(PAGE), [cat, q]);

  const categories = useMemo(() => (items ? categoriesOf(items) : []), [items]);
  const featured = useMemo(() => (items ? pickFeatured(items) : undefined), [items]);
  const saleItem = useMemo(
    () => items?.find((i) => i.sale && i.inStock && i.id !== featured?.id),
    [items, featured],
  );
  const list = useMemo(
    () => (items ?? []).filter((i) => (!cat || i.category === cat) && matchesSearch(i, q)),
    [items, cat, q],
  );

  const browsing = !cat && !q;
  const title = q ? `Resulta para sa “${q}”` : cat ? categoryLabel(cat) : 'Lahat ng produkto';

  return (
    <main className="c2-main">
      <CategoryNav categories={categories} active={cat} />

      {error && (
        <p className="c2-notice">
          Hindi ma-load ang mga produkto ngayon. Paki-refresh, o <a href={SHOP.messengerUrl}>i-message kami</a>.
        </p>
      )}

      {browsing && featured && (
        <Link to={`/product/${featured.id}`} className="c2-featured">
          <span className="c2-kicker">NAPILI NGAYONG LINGGO</span>
          <span className="c2-photo c2-photo-big">
            <img src={featured.images[0]} alt="" />
          </span>
          <span className="c2-featured-name">{featured.name}</span>
          <span className="c2-featured-price">
            <span className="c2-serif-price">{priceRange(featured.minPrice, featured.maxPrice)}</span>
            {featured.variants.length > 1 && <span className="c2-muted">{featured.variants.length} pagpipilian</span>}
          </span>
          <span className="c2-btn-outline">{featured.variants.length > 1 ? 'Tingnan ang sizes' : 'Tingnan'}</span>
        </Link>
      )}

      {browsing && saleItem?.sale && (
        <Link to={`/product/${saleItem.id}`} className="c2-sale-strip">
          <span>
            <strong>Sale:</strong> {saleItem.name} {peso(saleItem.sale.price)} <s>{peso(saleItem.sale.was)}</s>
          </span>
          <ArrowIcon />
        </Link>
      )}

      <section className="c2-section" aria-labelledby="c2-list-title">
        <h1 id="c2-list-title" className="c2-h">{title}</h1>
        {loading && <p className="c2-muted">Naglo-load ang mga produkto...</p>}
        {!loading && !error && list.length === 0 && (
          <p className="c2-muted">
            Walang nahanap. Subukan ang ibang salita, o <a href={SHOP.messengerUrl}>itanong sa amin</a>.
          </p>
        )}
        <div className="c2-grid">
          {list.slice(0, shown).map((item) => (
            <ProductTile key={item.id} item={item} />
          ))}
        </div>
        {list.length > shown && (
          <button type="button" className="c2-btn-outline c2-more" onClick={() => setShown((n) => n + PAGE)}>
            Ipakita pa ({list.length - shown})
          </button>
        )}
      </section>

      <div className="c2-chat-bar">
        <a className="c2-btn-solid" href={SHOP.messengerUrl}>Mag-order sa Messenger</a>
      </div>
    </main>
  );
}
