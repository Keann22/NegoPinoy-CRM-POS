import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck, FileText, RotateCcw, ArrowLeft, Mail, Phone } from 'lucide-react';
import { STORE_INFO } from '../data/storeData';

type LegalTab = 'privacy' | 'terms' | 'refund';

export const LegalPage: React.FC<{ defaultTab: LegalTab }> = ({ defaultTab }) => {
  const [activeTab, setActiveTab] = React.useState<LegalTab>(defaultTab);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (location.pathname.includes('privacy')) setActiveTab('privacy');
    else if (location.pathname.includes('terms')) setActiveTab('terms');
    else if (location.pathname.includes('refund')) setActiveTab('refund');
  }, [location.pathname]);

  return (
    <main className="legal-page-main container">
      <div className="legal-nav-header">
        <Link to="/" className="legal-back-btn">
          <ArrowLeft size={16} />
          <span>Bumalik sa Tindahan</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="legal-tabs-row">
        <button
          type="button"
          className={`legal-tab-btn ${activeTab === 'refund' ? 'active' : ''}`}
          onClick={() => setActiveTab('refund')}
        >
          <RotateCcw size={16} />
          <span>Return & Refund (7-Day Warranty)</span>
        </button>
        <button
          type="button"
          className={`legal-tab-btn ${activeTab === 'terms' ? 'active' : ''}`}
          onClick={() => setActiveTab('terms')}
        >
          <FileText size={16} />
          <span>Terms of Service</span>
        </button>
        <button
          type="button"
          className={`legal-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
          onClick={() => setActiveTab('privacy')}
        >
          <ShieldCheck size={16} />
          <span>Privacy Policy</span>
        </button>
      </div>

      <div className="legal-content-card">
        {/* Return & Refund Policy */}
        {activeTab === 'refund' && (
          <div className="legal-article">
            <h1>Return, Replacement & Refund Policy</h1>
            <p className="legal-meta">
              Opisyal na Patakaran ng <strong>{STORE_INFO.legalName}</strong> ({STORE_INFO.name})
            </p>

            <div className="legal-highlight-box">
              <ShieldCheck size={24} className="text-gold" />
              <div>
                <strong>7-Day Replacement Guarantee</strong>
                <p>
                  Sinisiguro namin na walang palpak na item ang matatanggap mo. Kung may manufacturing defect o pinsala dulot ng shipping, papalitan namin ito nang walang abala.
                </p>
              </div>
            </div>

            <section>
              <h2>1. Karapatan sa Pagpapalit (7-Day Return/Replacement)</h2>
              <p>
                May pitong (7) araw ka mula nang mai-deliver ang iyong package upang ipagbigay-alam sa amin ang anumang factory defect o damage dulot ng biyahe. Upang maging kwalipikado:
              </p>
              <ul>
                <li>Dapat ay nasa orihinal na kahon o lalagyan ang item kasama ang kumpletong accessories at manual.</li>
                <li>Ihanda ang litrato o unboxing video bilang katibayan ng pinsala o depekto.</li>
                <li>May patunay ng order o chat record sa aming Facebook Messenger page.</li>
              </ul>
            </section>

            <section>
              <h2>2. Proseso ng Refund</h2>
              <p>
                Kapag na-verify ng aming Quality Assurance team ang item at walang available na pamalit na stock, ipo-proseso ang buong refund sa pamamagitan ng GCash o Bank Transfer sa loob ng 1 hanggang 3 business days.
              </p>
            </section>

            <section>
              <h2>3. Paano Mag-file ng Claim</h2>
              <p>
                Mag-send lamang ng mensahe sa aming official Messenger: <strong>{STORE_INFO.facebookPageUrl}</strong> kasama ang:
              </p>
              <ul>
                <li>Pangalan ng Customer at Numero ng Telepono</li>
                <li>Pangalan ng Produkto at Petsa ng Pagkatanggap</li>
                <li>Maikling video o mga litrato na nagpapakita ng isyu</li>
              </ul>
            </section>
          </div>
        )}

        {/* Terms of Service */}
        {activeTab === 'terms' && (
          <div className="legal-article">
            <h1>Mga Tuntunin sa Serbisyo (Terms of Service)</h1>
            <p className="legal-meta">
              Pinapatakbo ng <strong>{STORE_INFO.legalName}</strong> | Victoria, Oriental Mindoro
            </p>

            <section>
              <h2>1. Pangkalahatang Kundisyon</h2>
              <p>
                Sa paggamit ng website na ito at pag-order sa {STORE_INFO.name}, sumasang-ayon ka sa mga patakaran ng kalakalan sa ilalim ng mga batas ng Republika ng Pilipinas.
              </p>
            </section>

            <section>
              <h2>2. Pagpepresyo at Stock Availability</h2>
              <p>
                Ang lahat ng presyo at availability ng stock ay totoo ayon sa aming imbentaryo. May karapatan kaming mag-update ng presyo kapag may promo, live selling discount, o bundle deal nang walang paunang abiso.
              </p>
            </section>

            <section>
              <h2>3. Transaksyon at Pag-order sa Messenger</h2>
              <p>
                Upang mapanatili ang personalized na serbisyo para sa bawat pamilya at negosyante, ang order confirmation at shipping arrangement ay pinalilipas sa aming official Messenger support. Sinisiguro namin ang seguridad ng iyong impormasyon.
              </p>
            </section>

            <section>
              <h2>4. Cash on Delivery (COD) Responsibilidad</h2>
              <p>
                Hinihiling namin sa lahat ng mga suki na maging responsable sa pag-tanggap ng COD orders upang maiwasan ang RTS (Return to Sender) fees at hindi maantala ang serbisyo ng ating mga masisipag na delivery riders.
              </p>
            </section>
          </div>
        )}

        {/* Privacy Policy */}
        {activeTab === 'privacy' && (
          <div className="legal-article">
            <h1>Patakaran sa Privacy (Privacy Policy)</h1>
            <p className="legal-meta">
              Pangangalaga ng Datos alinsunod sa Philippine Data Privacy Act of 2012 (RA 10173)
            </p>

            <section>
              <h2>1. Impormasyong Aming Kinokolekta</h2>
              <p>
                Kinokolekta lamang namin ang mga impormasyong kinakailangan sa pagpapadala ng iyong order tulad ng:
              </p>
              <ul>
                <li>Buong Pangalan ng Tatanggap</li>
                <li>Kumpletong Delivery Address (Barangay, Munisipyo, Probinsya, Landmark)</li>
                <li>Aktibong Numero ng Telepono para sa courier notification</li>
              </ul>
            </section>

            <section>
              <h2>2. Paano Ginagamit ang Iyong Impormasyon</h2>
              <p>
                Hindi kailanman ibinebenta, ipinaparenta, o ipinapamahagi ang iyong personal na impormasyon sa mga third-party advertiser. Ginagamit lamang ito para sa:
              </p>
              <ul>
                <li>Pag-generate ng waybill sa aming courier partners (SPX, J&T).</li>
                <li>Pag-update sa status ng iyong package at warranty service.</li>
              </ul>
            </section>

            <section>
              <h2>3. Makipag-ugnayan sa Data Protection Officer</h2>
              <p>
                Para sa anumang katanungan o kahilingan na tanggalin ang inyong impormasyon sa aming records, sumulat sa:
              </p>
              <p>
                <Mail size={16} className="inline-icon" /> Email: <strong>{STORE_INFO.email}</strong>
                <br />
                <Phone size={16} className="inline-icon" /> Telepono: <strong>{STORE_INFO.phone}</strong>
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
};
