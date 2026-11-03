import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, ShoppingBag, Truck, CheckCircle2 } from 'lucide-react';
import { FAQ_ITEMS, STORE_INFO } from '../../data/storeData';

export const FaqSection: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0].id);

  const toggleFaq = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  const steps = [
    {
      num: '1',
      title: 'Pumili sa Catalog',
      desc: 'Tingnan ang ating mga produkto at piliin ang angkop sa iyong tahanan o negosyo.',
      icon: <ShoppingBag size={20} />,
    },
    {
      num: '2',
      title: 'Order via Messenger',
      desc: 'Pindutin ang button para maipadala ang prefilled details sa aming support team.',
      icon: <MessageCircle size={20} />,
    },
    {
      num: '3',
      title: 'Kumpirmahin ang Address',
      desc: 'Ibigay ang iyong buong pangalan at delivery address para maihanda ang parcel.',
      icon: <CheckCircle2 size={20} />,
    },
    {
      num: '4',
      title: 'COD Delivery sa Pintuan',
      desc: 'Tanggapin at i-check ang package bago magbayad kay rider via Cash on Delivery.',
      icon: <Truck size={20} />,
    },
  ];

  return (
    <section id="faq" className="faq-section">
      <div className="container">
        {/* Step-by-Step Order Guide */}
        <div className="order-guide-container">
          <div className="section-intro text-center">
            <span className="section-eyebrow">Madali at Ligtas</span>
            <h2 className="section-heading">4 Simpleng Hakbang sa Pag-order</h2>
            <p className="section-subheading">
              Walang komplikadong registration form. Diretso at protektado ang transaksyon.
            </p>
          </div>

          <div className="steps-grid">
            {steps.map((s) => (
              <div key={s.num} className="step-card">
                <div className="step-number-bubble">{s.num}</div>
                <div className="step-icon-box">{s.icon}</div>
                <h3 className="step-title">{s.title}</h3>
                <p className="step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQs Accordion */}
        <div className="faq-container">
          <div className="section-intro text-center" style={{ marginTop: '3.5rem' }}>
            <span className="section-eyebrow">Gusto Mo Bang Malaman?</span>
            <h2 className="section-heading">Mga Madalas Itanong (FAQ)</h2>
            <p className="section-subheading">
              Nandito ang mga kasagutan sa inyong katanungan tungkol sa delivery, payment, at warranty.
            </p>
          </div>

          <div className="faq-accordion">
            {FAQ_ITEMS.map((item) => {
              const isOpen = openId === item.id;
              return (
                <div key={item.id} className={`faq-card ${isOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="faq-question-btn"
                    onClick={() => toggleFaq(item.id)}
                  >
                    <span className="faq-question-text">{item.question}</span>
                    <span className="faq-chevron-icon">
                      {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="faq-answer-body">
                      <p>{item.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="faq-cta-box text-center">
            <p>May iba ka pa bang katanungan o nais ipasadya para sa iyong negosyo?</p>
            <a
              href={STORE_INFO.messengerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-faq-messenger"
            >
              <MessageCircle size={18} />
              <span>Magtanong Diretso sa Aming Messenger</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
