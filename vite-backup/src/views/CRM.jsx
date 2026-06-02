import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const TIER_ORDER = { VIP: 3, Regular: 2, Newbie: 1 };

function TierBadge({ tier }) {
  const t = tier?.toLowerCase();
  const cls = t === 'vip' ? 'badge-vip' : t === 'regular' ? 'badge-regular' : 'badge-newbie';
  const icon = t === 'vip' ? '⭐' : t === 'regular' ? '🔵' : '🌱';
  return <span className={`badge ${cls}`}>{icon} {tier || 'Newbie'}</span>;
}

export default function CRM() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('total_lifetime_spend', { ascending: false });
    setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCustomers(); }, []);

  const filtered = customers.filter(c => {
    const matchTier = filter === 'All' || (c.suki_tier || 'Newbie') === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || c.full_name?.toLowerCase().includes(q) || c.location_city?.toLowerCase().includes(q) || c.mobile_number?.includes(q);
    return matchTier && matchSearch;
  });

  const stats = {
    total: customers.length,
    vip: customers.filter(c => c.suki_tier === 'VIP').length,
    regular: customers.filter(c => c.suki_tier === 'Regular').length,
    totalSpend: customers.reduce((s, c) => s + Number(c.total_lifetime_spend || 0), 0),
  };

  return (
    <div>
      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Sukis</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-sub">Registered customers</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">VIP Sukis ⭐</div>
          <div className="stat-value text-amber">{stats.vip}</div>
          <div className="stat-sub">₱15,000+ spend</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Regular Sukis</div>
          <div className="stat-value text-blue">{stats.regular}</div>
          <div className="stat-sub">₱5,000+ spend</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value text-emerald">₱{stats.totalSpend.toLocaleString()}</div>
          <div className="stat-sub">Lifetime spend</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4" style={{ flexWrap: 'wrap' }}>
        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
          <span className="search-icon">🔍</span>
          <input className="input" placeholder="Search by name, city, or mobile..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {['All', 'VIP', 'Regular', 'Newbie'].map(t => (
            <button key={t} className={`btn btn-sm ${filter === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <button className="refresh-btn" onClick={fetchCustomers} disabled={loading} title="Refresh">
          <span style={{ display: 'inline-block', animation: loading ? 'spin 0.7s linear infinite' : 'none' }}>🔄</span>
        </button>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Tier</th>
                <th>Kitchen Profile</th>
                <th>Location</th>
                <th>Lifetime Spend</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="6">
                  <div className="empty-state">
                    <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                    <h3>No customers found</h3>
                    <p>Adjust the filter or search term</p>
                  </div>
                </td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(selected?.id === c.id ? null : c)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.full_name || 'Unknown'}</div>
                    <div className="text-xs text-muted" style={{ fontFamily: 'monospace' }}>{c.psid}</div>
                  </td>
                  <td><TierBadge tier={c.suki_tier} /></td>
                  <td>
                    <div className="text-sm">🔥 {c.stove_type || '—'}</div>
                    {c.family_size && <div className="text-xs text-muted">👨‍👩‍👧 {c.family_size}</div>}
                  </td>
                  <td className="text-sm">{c.location_city || '—'}</td>
                  <td>
                    <div className="text-emerald font-bold">₱{Number(c.total_lifetime_spend || 0).toLocaleString()}</div>
                  </td>
                  <td className="text-sm">{c.mobile_number || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expanded Profile */}
        {selected && (
          <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold" style={{ fontSize: 16 }}>📋 Full Profile — {selected.full_name}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕ Close</button>
            </div>
            <div className="grid-2">
              <div>
                <div className="text-xs text-muted mb-1">Honorific</div>
                <div className="text-sm">{selected.preferred_honorific || 'Ma\'am'}</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Email</div>
                <div className="text-sm">{selected.email || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Payment Preference</div>
                <div className="text-sm">{selected.preferred_payment || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Specialty Cuisine</div>
                <div className="text-sm">{selected.specialty_cuisine || '—'}</div>
              </div>
              {selected.ai_summary_notes && (
                <div style={{ gridColumn: 'span 2' }}>
                  <div className="text-xs text-muted mb-1">🤖 AI Summary Notes</div>
                  <div className="text-sm" style={{ background: 'var(--bg-card)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>{selected.ai_summary_notes}</div>
                </div>
              )}
              {selected.testimonials && (
                <div style={{ gridColumn: 'span 2' }}>
                  <div className="text-xs text-muted mb-1">💬 Testimonial</div>
                  <div className="text-sm" style={{ color: 'var(--accent-amber)', fontStyle: 'italic' }}>"{selected.testimonials}"</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
