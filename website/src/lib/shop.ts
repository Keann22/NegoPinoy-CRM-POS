// Shop facts and small helpers shared by the C2 pages.

export const SHOP = {
  name: 'NegoPinoy',
  town: 'Victoria, Oriental Mindoro',
  address: 'Poblacion 1, Victoria, Oriental Mindoro',
  hours: 'Lunes–Sabado, 8:00 AM – 6:00 PM',
  phone: '0917-186-9554',
  facebookUrl: 'https://www.facebook.com/NegoPinoyPH',
  messengerUrl: 'https://m.me/NegoPinoyPH',
};

export const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH');

/** Hulugan estimate shown on the site: price spread over 3 months (same rule as before). */
export const monthly = (n: number) => peso(n / 3);

export const priceRange = (min: number, max: number) =>
  min === max ? peso(min) : `${peso(min)} – ${peso(max)}`;

/** Messenger link with the customer's first message already written. */
export const messengerWith = (text: string) => `${SHOP.messengerUrl}?text=${encodeURIComponent(text)}`;
