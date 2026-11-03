import { Link } from 'react-router-dom';
import type { CatalogItem } from '../lib/catalog';
import { peso } from '../lib/shop';

// One product in the grid: photo, name, starting price.
export function ProductTile({ item }: { item: CatalogItem }) {
  const from = item.variants.length > 1 && item.minPrice !== item.maxPrice;
  return (
    <Link to={`/product/${item.id}`} className="c2-tile">
      <span className="c2-photo">
        {item.images[0] ? <img src={item.images[0]} alt="" loading="lazy" /> : <span className="c2-photo-empty">Walang litrato</span>}
      </span>
      <span className="c2-tile-name">{item.name}</span>
      <span className="c2-tile-price">
        {from && <span className="c2-from">mula </span>}
        {peso(item.minPrice)}
        {item.sale && <span className="c2-tag">Sale</span>}
      </span>
      {!item.inStock && <span className="c2-tile-note">Itanong kung may stock</span>}
    </Link>
  );
}
