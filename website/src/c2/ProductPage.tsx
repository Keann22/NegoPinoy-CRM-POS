import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { categoryLabel } from '../lib/catalog';
import { useCatalog } from '../lib/useCatalog';
import { messengerWith, monthly, peso, SHOP } from '../lib/shop';
import { BackIcon } from './Icons';

export function ProductPage() {
  const { id } = useParams();
  const { items, loading, error } = useCatalog();
  // The id can be the product's or one of its sizes' (older links used size ids).
  const item = useMemo(
    () => items?.find((i) => i.id === id) ?? items?.find((i) => i.variants.some((v) => v.id === id)),
    [items, id],
  );
  const [variantId, setVariantId] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);

  // Start on the linked size, else the first one in stock.
  useEffect(() => {
    if (!item) return setVariantId(null);
    const linked = item.variants.find((v) => v.id === id);
    setVariantId((linked ?? item.variants.find((v) => v.inStock) ?? item.variants[0]).id);
    setPhoto(0);
    window.scrollTo(0, 0);
  }, [item, id]);

  if (loading) return <main className="c2-main c2-pad"><p className="c2-muted">Naglo-load...</p></main>;
  if (error || !item) {
    return (
      <main className="c2-main c2-pad">
        <p>Hindi makita ang produktong ito.</p>
        <p><Link to="/">Bumalik sa lahat ng produkto</Link> o <a href={SHOP.messengerUrl}>itanong sa amin</a>.</p>
      </main>
    );
  }

  const v = item.variants.find((x) => x.id === variantId) ?? item.variants[0];
  const price = v.salePrice ?? v.price;
  const multi = item.variants.length > 1;
  const named = multi ? `${item.name} (${v.label})` : item.name;
  const orderUrl = messengerWith(`Hi NegoPinoy! Gusto ko pong umorder: ${named}, ${peso(price)}.`);
  const askUrl = messengerWith(`Hi NegoPinoy! May tanong po ako tungkol sa ${named}.`);

  return (
    <main className="c2-main c2-product">
      <div className="c2-back-row">
        <Link to={item.category ? `/?cat=${encodeURIComponent(item.category)}` : '/'} className="c2-back">
          <BackIcon /> Bumalik
        </Link>
      </div>

      <div className="c2-photo c2-photo-hero">
        {item.images[photo] ? <img src={item.images[photo]} alt={item.name} /> : <span className="c2-photo-empty">Walang litrato</span>}
      </div>
      {item.images.length > 1 && (
        <div className="c2-thumbs" aria-label="Mga litrato">
          {item.images.map((src, i) => (
            <button key={src} type="button" className={i === photo ? 'is-active' : ''} aria-label={`Litrato ${i + 1}`} aria-pressed={i === photo} onClick={() => setPhoto(i)}>
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}

      <section className="c2-pad c2-stack">
        {item.category && <span className="c2-kicker">{categoryLabel(item.category).toUpperCase()}</span>}
        <h1 className="c2-product-name">{item.name}</h1>
        <p className="c2-price-line">
          <span className="c2-serif-price c2-price-big">{peso(price)}</span>
          {v.salePrice !== null && <s className="c2-muted">{peso(v.price)}</s>}
        </p>
        <p className="c2-muted">o {monthly(price)}/buwan sa hulugan · itanong ang terms</p>
        <p className={v.inStock ? 'c2-stock-ok' : 'c2-stock-ask'}>{v.inStock ? 'May stock' : 'Itanong muna kung may stock'}</p>
      </section>

      {multi && (
        <section className="c2-pad c2-stack" aria-labelledby="c2-size-title">
          <h2 id="c2-size-title" className="c2-label">Piliin: {v.label}</h2>
          <div className="c2-sizes">
            {item.variants.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`c2-size${x.id === v.id ? ' is-active' : ''}${x.inStock ? '' : ' is-ask'}`}
                aria-pressed={x.id === v.id}
                onClick={() => setVariantId(x.id)}
              >
                <span className="c2-size-label">{x.label}</span>
                <span className="c2-size-price">{peso(x.salePrice ?? x.price)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="c2-pad c2-stack">
        <a className="c2-btn-solid" href={orderUrl}>I-order{multi ? ` ang ${v.label}` : ''} sa Messenger</a>
        <a className="c2-btn-outline" href={askUrl}>Magtanong muna</a>
      </section>

      {item.description && (
        <section className="c2-pad c2-stack c2-description">
          <h2 className="c2-h">Tungkol sa produkto</h2>
          <p>{item.description}</p>
        </section>
      )}

      <div className="c2-sticky-order">
        <span className="c2-sticky-price">
          {multi && <span className="c2-muted">{v.label}</span>}
          <span className="c2-serif-price">{peso(price)}</span>
        </span>
        <a className="c2-btn-solid" href={orderUrl}>Order sa Messenger</a>
      </div>
    </main>
  );
}
