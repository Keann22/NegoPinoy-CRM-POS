'use client';

import { useEffect, useState } from 'react';

/**
 * The Philippine region → province → city → barangay list is 1.3 MB. Importing
 * it directly baked it into the Orders, Customers, For Shipping and Packed Orders
 * pages, so phones had to download and parse it on every open. Load it on demand
 * (only when an address form opens) and keep it in memory after the first time.
 */
export type AddressData = Record<string, any>;

const EMPTY: AddressData = {};
let cache: AddressData | null = null;
let pending: Promise<AddressData> | null = null;

export function loadAddressData(): Promise<AddressData> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = import('./philippine-address-data.json')
      .then((m: any) => {
        cache = (m.default ?? m) as AddressData;
        return cache;
      })
      .catch((err) => {
        pending = null; // allow a retry next time the form opens
        throw err;
      });
  }
  return pending;
}

/**
 * Returns the address data once loaded (`isLoaded`), or an empty object before
 * that, so option lists simply start empty. Loading starts when `enabled` is true.
 */
export function useAddressData(enabled: boolean): { addressData: AddressData; isLoaded: boolean } {
  const [data, setData] = useState<AddressData | null>(cache);

  useEffect(() => {
    if (!enabled || data) return;
    let alive = true;
    loadAddressData()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((err) => console.error('Failed to load address list:', err));
    return () => {
      alive = false;
    };
  }, [enabled, data]);

  return { addressData: data ?? EMPTY, isLoaded: !!data };
}
