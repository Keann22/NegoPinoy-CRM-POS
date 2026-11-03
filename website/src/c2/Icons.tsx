// Small stroke icons for the C2 design (decorative: aria-hidden).
const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const ChatIcon = () => (
  <svg {...base}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-4.6A8 8 0 0 1 3 11.5 8.6 8.6 0 0 1 12 3a8.6 8.6 0 0 1 9 8.5z" />
  </svg>
);

export const BackIcon = () => (
  <svg {...base} width={20} height={20} strokeWidth={1.8}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const ArrowIcon = () => (
  <svg {...base} width={18} height={18} strokeWidth={1.8}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base} width={20} height={20}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
