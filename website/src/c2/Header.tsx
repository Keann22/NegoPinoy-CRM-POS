import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SHOP } from '../lib/shop';
import { ChatIcon, CloseIcon, SearchIcon } from './Icons';

// Logo, search and Messenger, with the one-line trust strip under them.
export function Header() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(Boolean(params.get('q')));
  const [query, setQuery] = useState(params.get('q') ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/');
  };

  const close = () => {
    setOpen(false);
    setQuery('');
    if (params.get('q')) navigate('/');
  };

  return (
    <header className="c2-header">
      <div className="c2-header-row">
        <Link to="/" className="c2-brand">
          <img src="/logo.png" alt="" width={34} height={34} />
          <span>{SHOP.name}</span>
        </Link>
        <div className="c2-header-actions">
          <button type="button" className="c2-icon-btn" aria-label="Hanapin" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <SearchIcon />
          </button>
          <a className="c2-icon-btn" href={SHOP.messengerUrl} aria-label="Mag-message sa Messenger">
            <ChatIcon />
          </a>
        </div>
      </div>

      {open && (
        <form className="c2-search" role="search" onSubmit={submit}>
          <label htmlFor="c2-search-input" className="c2-sr-only">Hanapin ang produkto</label>
          <input
            id="c2-search-input"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hanapin: kaldero, blender, lalagyan..."
            enterKeyHint="search"
          />
          <button type="button" className="c2-icon-btn" aria-label="Isara ang paghahanap" onClick={close}>
            <CloseIcon />
          </button>
        </form>
      )}

      <p className="c2-trust">
        <strong>COD</strong>
        <span aria-hidden="true">·</span>
        <strong>Hulugan</strong>
        <span aria-hidden="true">·</span>
        <span>{SHOP.town}</span>
      </p>
    </header>
  );
}
