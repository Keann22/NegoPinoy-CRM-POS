import type { Testimonial, FAQItem } from '../types/store';

export const STORE_INFO = {
  name: 'NegoPinoy',
  legalName: 'Colev Elijah Enterprises',
  tagline: 'Mga Gamit sa Bahay at Negosyo na Subok at Maasahan',
  address: 'Poblacion 1, Victoria, Oriental Mindoro, Philippines',
  phone: '0917-186-9554',
  email: 'ornoskeneth@gmail.com',
  facebookPageUrl: 'https://www.facebook.com/NegoPinoyPH',
  messengerUrl: 'https://m.me/NegoPinoyPH',
  hours: 'Lunes hanggang Sabado, 8:00 AM - 6:00 PM',
};

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 't-1',
    name: 'Nanay Rowena Santos',
    location: 'Batangas City',
    role: 'Home Baker & Misis',
    comment: 'Subok talaga ang quality! Dito ako kumuha ng oven at mixer para sa pampaaral ng bunso ko. Napaka-bait ng kausap sa Messenger at dumating agad via COD. Salamat NegoPinoy!',
    rating: 5,
    verifiedPurchase: true,
    productName: 'Heavy Duty Stand Mixer',
  },
  {
    id: 't-2',
    name: 'Joel Macaraig',
    location: 'Dubai, UAE (Padala to Oriental Mindoro)',
    role: 'OFW Care Package Sender',
    comment: 'Bilang OFW, napakalaking ginhawa na may trusted online store na nag-aalaga ng padala para sa magulang ko. Mismong si Nanay ang nag-receive at tuwang-tuwa sa induction cooker at cookware set.',
    rating: 5,
    verifiedPurchase: true,
    productName: 'Multi-Cooker & Cookware Set',
  },
  {
    id: 't-3',
    name: 'Ate Maricris Del Rosario',
    location: 'Cavite',
    role: 'Sari-Sari Store & Eatery Owner',
    comment: 'Napakaganda ng lay-away program nila! Hindi mabigat sa bulsa, hulugan na walang sakit sa ulo. Dumating ang unit na walang anumang basag dahil maayos ang bubble wrap.',
    rating: 5,
    verifiedPurchase: true,
    productName: 'Commercial Blender & Ice Crusher',
  },
  {
    id: 't-4',
    name: 'Marites Hernandez',
    location: 'Quezon City',
    role: 'Verified Buyer',
    comment: 'Akala ko dati over-hyped lang sa live selling, pero nung dumating sa bahay, solid ang stainless at ang bigat ng materyales. Worth every peso!',
    rating: 5,
    verifiedPurchase: true,
    productName: 'Stainless Steel Steamer Pot',
  },
];

export const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'Paano umorder sa NegoPinoy?',
    answer: 'Napakadali at diretso! Piliin lamang ang nais mong produkto sa aming catalog, pindutin ang "Order via Messenger", at awtomatikong mai-send ang detalye ng produkto sa aming official customer support team. Doon ay kukunin namin ang iyong pangalan, delivery address, at contact number para maipadala agad.',
    category: 'Ordering',
  },
  {
    id: 'faq-2',
    question: 'May Cash on Delivery (COD) ba nationwide?',
    answer: 'Opo! May Cash on Delivery (COD) kami sa buong Pilipinas (Luzon, Visayas, at Mindanao) sa tulong ng aming mga courier partners tulad ng SPX at J&T Express. Magbabayad ka lamang kapag ligtas nang iniabot ng rider ang parcel sa iyong pintuan.',
    category: 'Payment & Shipping',
  },
  {
    id: 'faq-3',
    question: 'Paano gumagana ang Installment o Lay-away plan?',
    answer: 'Nag-aalok kami ng flexible Lay-away at hulugan options para sa mga gustong mag-ipon o maghulog nang hindi nabibigla ang budget. I-message lamang kami sa aming Messenger para mapag-usapan ang term (2 hanggang 6 na buwan) at maibigay ang terms ayon sa iyong kagustuhan.',
    category: 'Payment & Shipping',
  },
  {
    id: 'faq-4',
    question: 'Nasa abroad ako (OFW). Puwede ba akong magpadala para sa pamilya ko sa Pinas?',
    answer: 'Siguradong puwede! Marami sa aming mga suki ay mga kababayan nating OFW sa Middle East, Asia, Europe, at North America. Puwede kang magbayad via online banking, GCash, o remittance, at kami na ang magpapadala ng regalo o appliances diretso sa pintuan ng iyong pamilya sa probinsya.',
    category: 'OFW Services',
  },
  {
    id: 'faq-5',
    question: 'May warranty o replacement ba sakaling may sira ang item?',
    answer: 'Mayroon tayong 7-Day Replacement Guarantee para sa mga factory defect o damage na sanhi ng shipping. Bawat item ay ini-inspeksyon at tinetest ng aming QA bago i-pack. Kung may kailangan kayong tulong, agad kaming magre-reply sa Messenger.',
    category: 'Warranty & Returns',
  },
];

export const TRUST_PILLARS = [
  {
    title: 'Subok na De-Kalidad',
    description: 'Sinasala at tinetest namin ang bawat item bago i-pack para makasigurong matibay at tatagal sa pang-araw-araw na gamit.',
    icon: 'ShieldCheck',
    badge: '100% Quality Tested',
  },
  {
    title: 'Hulugan at Lay-away Options',
    description: 'Budget-friendly terms para sa mga pamilya at negosyante. Puwedeng hulugan upang hindi mabigat sa bulsa.',
    icon: 'CalendarClock',
    badge: 'Flexible Payment',
  },
  {
    title: 'Nationwide Cash on Delivery',
    description: 'Bayaran lamang kapag hawak mo na ang package sa inyong pintuan. Ligtas, mabilis, at walang kaba.',
    icon: 'Truck',
    badge: 'Door-to-Door Delivery',
  },
  {
    title: 'Alagang OFW at Suki Misis',
    description: 'May dedikadong team na mag-aasikaso ng padala mo para sa pamilya sa Pilipinas nang may video updates at tracking.',
    icon: 'HeartHandshake',
    badge: 'Trusted Pinoy Partner',
  },
];
