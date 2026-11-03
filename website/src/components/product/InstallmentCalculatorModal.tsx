import React, { useState } from 'react';
import { X, Calendar, Calculator, MessageCircle, ShieldAlert } from 'lucide-react';
import { STORE_INFO } from '../../data/storeData';

interface InstallmentCalculatorModalProps {
  productName: string;
  price: number;
  isOpen: boolean;
  onClose: () => void;
}

export const InstallmentCalculatorModal: React.FC<InstallmentCalculatorModalProps> = ({
  productName,
  price,
  isOpen,
  onClose,
}) => {
  const [termMonths, setTermMonths] = useState<number>(3);
  const [downpaymentPct, setDownpaymentPct] = useState<number>(20);

  if (!isOpen) return null;

  const validPrice = Math.max(price, 500);
  const downpaymentAmount = Math.round((validPrice * downpaymentPct) / 100);
  const remainingBalance = validPrice - downpaymentAmount;
  const monthlyAmount = Math.round(remainingBalance / termMonths);
  const biWeeklyAmount = Math.round(monthlyAmount / 2);

  const prefilledText = `Hi NegoPinoy! Interesado po ako mag-Lay-away / Installment para sa "${productName}".%0APresyo: ₱${validPrice.toLocaleString()}%0ATerm: ${termMonths} buwan%0AEstimated Downpayment: ₱${downpaymentAmount.toLocaleString()} (${downpaymentPct}%)%0AEstimated Hulog kada Buwan: ₱${monthlyAmount.toLocaleString()}/buwan (o ₱${biWeeklyAmount.toLocaleString()} kada 15 days).%0APaturo po paano magsimula!`;

  const messengerLink = `${STORE_INFO.messengerUrl}?text=${prefilledText}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card calculator-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <Calculator size={22} className="text-blue" />
            <div>
              <h3>Lay-away & Installment Calculator</h3>
              <p className="modal-subtitle">{productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn" aria-label="Isara">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="calc-price-summary">
            <span>Kabuuang Halaga ng Item:</span>
            <span className="calc-big-price">₱ {validPrice.toLocaleString()}</span>
          </div>

          {/* Term Selector */}
          <div className="calc-section">
            <label className="calc-label">
              <Calendar size={16} /> Piliin ang Haba ng Hulugan:
            </label>
            <div className="calc-options-grid">
              {[2, 3, 4, 6].map((months) => (
                <button
                  key={months}
                  type="button"
                  className={`calc-option-btn ${termMonths === months ? 'active' : ''}`}
                  onClick={() => setTermMonths(months)}
                >
                  <span className="term-num">{months}</span>
                  <span className="term-unit">Buwan</span>
                </button>
              ))}
            </div>
          </div>

          {/* Downpayment Selector */}
          <div className="calc-section">
            <label className="calc-label">Porsyento ng Paunang Bayad (Downpayment):</label>
            <div className="calc-options-grid">
              {[10, 20, 30, 40].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`calc-option-btn ${downpaymentPct === pct ? 'active' : ''}`}
                  onClick={() => setDownpaymentPct(pct)}
                >
                  <span className="term-num">{pct}%</span>
                  <span className="term-unit">₱{Math.round((validPrice * pct) / 100).toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Result Card */}
          <div className="calc-result-card">
            <div className="calc-result-row">
              <span>Downpayment:</span>
              <strong>₱ {downpaymentAmount.toLocaleString()}</strong>
            </div>
            <div className="calc-result-row">
              <span>Hulog kada Buwan ({termMonths} mos):</span>
              <strong className="calc-highlight-val">₱ {monthlyAmount.toLocaleString()} / buwan</strong>
            </div>
            <div className="calc-result-row sub-row">
              <span>O kada kinsenas (every 15 days):</span>
              <span>₱ {biWeeklyAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="calc-notes">
            <ShieldAlert size={16} className="text-amber" />
            <span>
              Ang lay-away plan ay 0% interest! Walang hidden charges. I-message kami para sa official terms at resibo.
            </span>
          </div>

          <a
            href={messengerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-calc-messenger"
          >
            <MessageCircle size={18} />
            <span>I-apply itong Hulugan Plan sa Messenger</span>
          </a>
        </div>
      </div>
    </div>
  );
};
