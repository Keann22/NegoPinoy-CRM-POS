import React, { useState } from 'react';
import './index.css';
import CRM from './views/CRM.jsx';
import POS from './views/POS.jsx';
import Training from './views/Training.jsx';
import Chat from './views/Chat.jsx';

const NAV = [
  { id: 'crm',      label: 'VIP Suki CRM',    icon: '👥', section: 'Customer' },
  { id: 'pos',      label: 'Point of Sale',   icon: '🛒', section: 'Sales' },
  { id: 'orders',   label: 'Order History',   icon: '📦', section: 'Sales' },
  { id: 'training', label: 'FAQ Training',    icon: '🧠', section: 'AI Engine' },
  { id: 'chat',     label: 'Chat History',    icon: '💬', section: 'AI Engine' },
];

const PAGE_TITLES = {
  crm:      { title: 'VIP Suki CRM',    sub: 'Manage customer profiles and kitchen intelligence' },
  pos:      { title: 'Point of Sale',   sub: 'Create orders and manage the cart' },
  orders:   { title: 'Order History',   sub: 'Full transaction history and status tracking' },
  training: { title: 'AI FAQ Training', sub: 'Review and approve AI-generated knowledge' },
  chat:     { title: 'Chat History',    sub: 'Raw conversation logs from Facebook Messenger' },
};

function Sidebar({ active, setActive }) {
  const sections = [...new Set(NAV.map(n => n.section))];
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🏪</div>
        <h1>NegoPinoy PH</h1>
        <p>Business Engine v2</p>
      </div>

      {sections.map(section => (
        <div key={section} className="sidebar-section">
          <div className="sidebar-section-label">{section}</div>
          {NAV.filter(n => n.section === section).map(n => (
            <button
              key={n.id}
              className={`nav-item${active === n.id ? ' active' : ''}`}
              onClick={() => setActive(n.id)}
            >
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
      ))}

      <div className="sidebar-status">
        <div className="flex items-center gap-2">
          <div className="status-dot" />
          <span className="text-xs text-muted">All Systems Online</span>
        </div>
        <div className="text-xs text-muted mt-2" style={{ lineHeight: 1.4 }}>
          Powered by Gemini 1.5 Flash<br />
          <span style={{ color: '#3b82f6' }}>sgkjdtwqqbrpmrfukhja</span>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const [active, setActive] = useState('crm');
  const page = PAGE_TITLES[active];

  const renderView = () => {
    if (active === 'crm') return <CRM />;
    if (active === 'pos' || active === 'orders') return <POS initialTab={active} />;
    if (active === 'training') return <Training />;
    if (active === 'chat') return <Chat />;
    return null;
  };

  return (
    <div className="layout">
      <Sidebar active={active} setActive={setActive} />
      <div className="main">
        <header className="topbar">
          <div>
            <div className="topbar-title">{page.title}</div>
            <div className="topbar-sub">{page.sub}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip">🇵🇭 Negosyanteng Pinoy</span>
          </div>
        </header>
        <div className="content">{renderView()}</div>
      </div>
    </div>
  );
}
