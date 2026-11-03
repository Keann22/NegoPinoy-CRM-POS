import { useEffect, useState } from 'react';
import { buildCatalog, fetchProducts, type CatalogItem } from './catalog';

// Loaded once per visit and shared by every page, so opening a product
// from the home page doesn't load the whole catalog again.
let cache: Promise<CatalogItem[]> | null = null;

function loadCatalog(): Promise<CatalogItem[]> {
  if (!cache) {
    cache = fetchProducts().then(buildCatalog);
    cache.catch(() => {
      cache = null; // let the next visit retry
    });
  }
  return cache;
}

export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((list) => alive && setItems(list))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  return { items, error, loading: !items && !error };
}
