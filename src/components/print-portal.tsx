'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/*
 * Print one block on its own (2026-11-26). The old way (.printable-area) only
 * hides the page behind it, which still takes its space: the Priority List
 * printed 3 pages of orders and 18 blank pages. Content inside <PrintPortal>
 * sits directly under <body>, hidden on screen; printOnly() prints just that
 * (globals.css: body.printing-portal hides everything else with display: none).
 */
export function PrintPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<div className="print-portal hidden">{children}</div>, document.body);
}

export function printOnly() {
  const body = document.body;
  body.classList.add('printing-portal');
  const done = () => {
    body.classList.remove('printing-portal');
    window.removeEventListener('afterprint', done);
  };
  // afterprint fires when the dialog closes (desktop and phones, where print() doesn't wait).
  window.addEventListener('afterprint', done);
  window.print();
}
