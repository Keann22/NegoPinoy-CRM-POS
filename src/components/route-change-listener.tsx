'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function RouteChangeListener() {
  const pathname = usePathname();

  useEffect(() => {
    // Force remove any leftover dialog locks from Radix UI on route change
    document.body.style.pointerEvents = 'auto';
    document.body.removeAttribute('data-scroll-locked');
  }, [pathname]);

  return null;
}
