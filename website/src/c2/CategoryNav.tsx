import { Link } from 'react-router-dom';
import { categoryLabel } from '../lib/catalog';

// Text-link category row; "Lahat" plus each category that has products.
export function CategoryNav({ categories, active }: { categories: string[]; active: string }) {
  return (
    <nav className="c2-cats" aria-label="Kategorya">
      <Link to="/" className={active ? '' : 'is-active'} aria-current={active ? undefined : 'page'}>
        Lahat
      </Link>
      {categories.map((c) => (
        <Link
          key={c}
          to={`/?cat=${encodeURIComponent(c)}`}
          className={active === c ? 'is-active' : ''}
          aria-current={active === c ? 'page' : undefined}
        >
          {categoryLabel(c)}
        </Link>
      ))}
    </nav>
  );
}
