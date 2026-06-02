import React, { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

const psidColor = (psid) => {
  const n = psid?.split('').reduce((a, c) => a + c.charCodeAt(0), 0) ?? 0;
  return `hsl(${Math.abs(n) % 360}, 55%, 38%)`;
};

function Avatar({ name, psid, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: name ? psidColor(psid) : 'var(--bg-card)',
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'white',
    }}>
      {name ? name.charAt(0).toUpperCase() : '?'}
    </div>
  );
}

export default function Chat() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPsid, setSelectedPsid] = useState(null);
  const [search, setSearch] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [newMsgPsids, setNewMsgPsids] = useState(new Set());
  const [customerDetail, setCustomerDetail] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [noteValue, setNoteValue] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [rightTab, setRightTab] = useState('info');
  const messagesEndRef = useRef(null);
  const selectedPsidRef = useRef(selectedPsid);
  useEffect(() => { selectedPsidRef.current = selectedPsid; }, [selectedPsid]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs, selectedPsid]);

  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('conversation_logs')
      .select('*, customers(full_name, suki_tier)')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (data) {
      setLogs(prev => {
        // Merge: keep all existing, add any new ones by id
        const existingIds = new Set(prev.map(l => l.id));
        const newOnes = data.filter(l => !existingIds.has(l.id));
        if (newOnes.length === 0) return prev; // no change
        // Mark new customer messages as unread if not currently selected
        newOnes.forEach(l => {
          if (l.sender_type === 'customer' && l.customer_psid !== selectedPsidRef.current) {
            setNewMsgPsids(p => new Set([...p, l.customer_psid]));
          }
        });
        return [...newOnes, ...prev];
      });
    }
    if (!silent) setLoading(false);
  };

  // Initial load
  useEffect(() => { fetchLogs(); }, []);

  // Polling fallback — every 20 seconds silently check for new messages
  useEffect(() => {
    const interval = setInterval(() => fetchLogs(true), 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedPsid && logs.length > 0) setSelectedPsid(logs[0].customer_psid);
  }, [logs]);

  // Fetch customer detail + orders when psid changes
  useEffect(() => {
    if (!selectedPsid) return;
    setCustomerDetail(null);
    setCustomerOrders([]);
    setNoteValue('');
    supabase.from('customers').select('*').eq('psid', selectedPsid).single()
      .then(({ data }) => {
        setCustomerDetail(data);
        setNoteValue(data?.ai_summary_notes ?? '');
      });
    supabase.from('orders').select('*, order_items(product_name, quantity, unit_price)')
      .eq('customer_id', (async () => {
        const { data } = await supabase.from('customers').select('id').eq('psid', selectedPsid).single();
        return data?.id;
      })())
      .order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setCustomerOrders(data || []));
  }, [selectedPsid]);

  // Fix: fetch orders properly
  useEffect(() => {
    if (!selectedPsid) return;
    (async () => {
      const { data: cust } = await supabase.from('customers').select('id').eq('psid', selectedPsid).single();
      if (!cust?.id) return;
      const { data: orders } = await supabase.from('orders')
        .select('*, order_items(product_name, quantity, unit_price)')
        .eq('customer_id', cust.id)
        .order('created_at', { ascending: false })
        .limit(5);
      setCustomerOrders(orders || []);
    })();
  }, [selectedPsid]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('chat-rt', { config: { broadcast: { ack: true } } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_logs' },
        async (payload) => {
          const { data: enriched } = await supabase
            .from('conversation_logs')
            .select('*, customers(full_name, suki_tier)')
            .eq('id', payload.new.id)
            .single();
          const log = enriched ?? payload.new;
          setLogs(prev => {
            if (prev.some(l => l.id === log.id)) return prev;
            return [log, ...prev];
          });
          if (payload.new.sender_type === 'customer' && payload.new.customer_psid !== selectedPsidRef.current) {
            setNewMsgPsids(p => new Set([...p, payload.new.customer_psid]));
          }
        }
      )
      .subscribe(status => {
        setIsLive(status === 'SUBSCRIBED');
        // If we just reconnected, do a silent fetch to catch any missed messages
        if (status === 'SUBSCRIBED') fetchLogs(true);
      });
    return () => supabase.removeChannel(channel);
  }, []);

  const saveNote = async () => {
    if (!customerDetail?.id) return;
    setSavingNote(true);
    await supabase.from('customers').update({ ai_summary_notes: noteValue }).eq('id', customerDetail.id);
    setCustomerDetail(prev => ({ ...prev, ai_summary_notes: noteValue }));
    setSavingNote(false);
  };

  const threads = useMemo(() => {
    const nameMap = new Map();
    logs.forEach(l => {
      if (!nameMap.get(l.customer_psid)) {
        const n = l.customers?.full_name || l.customer_name;
        if (n) nameMap.set(l.customer_psid, { name: n, tier: l.customers?.suki_tier });
      }
    });
    const map = new Map();
    logs.forEach(l => {
      if (!map.has(l.customer_psid)) {
        const info = nameMap.get(l.customer_psid) ?? {};
        map.set(l.customer_psid, { psid: l.customer_psid, name: info.name ?? null, tier: info.tier ?? null, lastMsg: l.message_text, lastDate: new Date(l.created_at), lastSender: l.sender_type });
      }
    });
    return Array.from(map.values());
  }, [logs]);

  const filtered = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.toLowerCase();
    return threads.filter(t => t.name?.toLowerCase().includes(q) || t.psid?.includes(q) || t.lastMsg?.toLowerCase().includes(q));
  }, [threads, search]);

  const activeThread = useMemo(() =>
    logs.filter(l => l.customer_psid === selectedPsid).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [logs, selectedPsid]);

  const selThread = useMemo(() => threads.find(t => t.psid === selectedPsid), [threads, selectedPsid]);

  const tierCls = t => t === 'VIP' ? 'badge-vip' : t === 'Regular' ? 'badge-regular' : 'badge-newbie';
  const statusCls = s => ({ Paid: 'badge-paid', Shipped: 'badge-shipped', Cancelled: 'badge-cancelled', Pending: 'badge-pending' })[s] ?? 'badge-pending';

  const painTags = useMemo(() => {
    if (!customerDetail?.pain_points) return [];
    try { return Object.keys(typeof customerDetail.pain_points === 'string' ? JSON.parse(customerDetail.pain_points) : customerDetail.pain_points); }
    catch { return []; }
  }, [customerDetail]);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 118px)', gap: 0, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>

      {/* ── COL 1: Thread List ── */}
      <div style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>💬 Conversations</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: isLive ? 'var(--accent-emerald)' : 'var(--accent-rose)', animation: isLive ? 'pulse 2s infinite' : 'none' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: isLive ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{isLive ? 'LIVE' : 'OFF'}</span>
            </div>
          </div>
          <input className="input" style={{ fontSize: 12, padding: '7px 10px' }} placeholder="🔍 Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? <div className="empty-state" style={{ padding: 40 }}><div className="spinner" /></div>
            : filtered.map(t => {
              const unread = newMsgPsids.has(t.psid);
              const active = selectedPsid === t.psid;
              return (
                <div key={t.psid} onClick={() => { setSelectedPsid(t.psid); setNewMsgPsids(p => { const n = new Set(p); n.delete(t.psid); return n; }); }}
                  style={{ padding: '11px 12px', cursor: 'pointer', borderLeft: `3px solid ${active ? 'var(--accent-blue)' : unread ? 'var(--accent-amber)' : 'transparent'}`, background: active ? 'var(--bg-elevated)' : unread ? 'rgba(245,158,11,0.04)' : 'transparent', borderBottom: '1px solid var(--border)', transition: 'background 0.12s' }}>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <Avatar name={t.name} psid={t.psid} size={34} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 12.5, fontWeight: unread ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.name ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: t.name ? 'normal' : 'italic', maxWidth: 110 }}>
                          {t.name || `Customer-${t.psid?.slice(-4)}`}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                          {t.lastDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 3, flexWrap: 'wrap' }}>
                        {t.tier && <span className={`badge ${tierCls(t.tier)}`} style={{ fontSize: 9, padding: '1px 5px' }}>{t.tier}</span>}
                        {unread && <span style={{ background: 'var(--accent-amber)', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>NEW</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.lastSender === 'bot' ? '🤖 ' : ''}{t.lastMsg}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* ── COL 2: Chat Thread ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {selThread ? (
          <>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <Avatar name={selThread.name} psid={selectedPsid} size={40} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selThread.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Customer-{selectedPsid?.slice(-4)}</span>}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                  {selThread.tier && <span className={`badge ${tierCls(selThread.tier)}`} style={{ fontSize: 10 }}>{selThread.tier}</span>}
                  {customerDetail?.stove_type && <span className="chip" style={{ fontSize: 10 }}>🔥 {customerDetail.stove_type}</span>}
                  {customerDetail?.location_city && <span className="chip" style={{ fontSize: 10 }}>📍 {customerDetail.location_city}</span>}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                <div>{activeThread.length} messages</div>
                <div style={{ color: isLive ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: 600 }}>● {isLive ? 'Live' : 'Offline'}</div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeThread.map(msg => {
                const isCustomer = msg.sender_type === 'customer';
                const isBot = msg.sender_type === 'bot';
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isCustomer ? 'flex-start' : 'flex-end', gap: 8 }}>
                    {isCustomer && <Avatar name={selThread.name} psid={selectedPsid} size={28} />}
                    <div style={{ maxWidth: '72%' }}>
                      <div className="bubble-meta">
                        <span>{isCustomer ? (selThread.name || 'Customer') : isBot ? '🤖 Ate AI' : '👨‍💼 Admin'}</span>
                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className={`chat-bubble ${isCustomer ? 'customer' : isBot ? 'bot' : 'admin'}`}>{msg.message_text}</div>
                    </div>
                    {!isCustomer && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: isBot ? 'rgba(16,185,129,0.15)' : 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 }}>
                        {isBot ? '🤖' : '👨‍💼'}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ height: '100%' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
            <h3>Select a conversation</h3>
            <p>Choose from the sidebar</p>
          </div>
        )}
      </div>

      {/* ── COL 3: Customer Profile Panel ── */}
      <div style={{ width: 280, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'var(--bg-elevated)' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {['info', 'orders'].map(tab => (
            <button key={tab} onClick={() => setRightTab(tab)} style={{ flex: 1, padding: '11px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', color: rightTab === tab ? 'var(--accent-blue)' : 'var(--text-muted)', borderBottom: `2px solid ${rightTab === tab ? 'var(--accent-blue)' : 'transparent'}`, transition: 'all 0.15s' }}>
              {tab === 'info' ? '👤 Information' : '📦 Orders'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {!customerDetail ? (
            <div className="empty-state" style={{ padding: 40 }}>
              {selectedPsid ? <div className="spinner" /> : <p>Select a conversation</p>}
            </div>
          ) : rightTab === 'info' ? (
            <>
              {/* Header card */}
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <Avatar name={selThread?.name} psid={selectedPsid} size={56} />
                <div style={{ marginTop: 10, fontWeight: 700, fontSize: 15 }}>{customerDetail.full_name || `Customer-${selectedPsid?.slice(-4)}`}</div>
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`badge ${tierCls(customerDetail.suki_tier)}`}>{customerDetail.suki_tier || 'Newbie'}</span>
                  {customerDetail.preferred_honorific && <span className="chip" style={{ fontSize: 10 }}>{customerDetail.preferred_honorific}</span>}
                </div>
              </div>

              {/* Contact info */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Contact</div>
                {[
                  { icon: '📱', label: customerDetail.mobile_number || '—' },
                  { icon: '📍', label: [customerDetail.location_city, customerDetail.location_barangay].filter(Boolean).join(', ') || '—' },
                  { icon: '📧', label: customerDetail.email || '—' },
                  { icon: '💳', label: customerDetail.preferred_payment || '—' },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, fontSize: 12.5 }}>
                    <span style={{ flexShrink: 0 }}>{row.icon}</span>
                    <span style={{ color: row.label === '—' ? 'var(--text-muted)' : 'var(--text-primary)', wordBreak: 'break-word' }}>{row.label}</span>
                  </div>
                ))}
              </div>

              {/* Kitchen profile */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Kitchen Profile</div>
                {[
                  { icon: '🔥', label: customerDetail.stove_type || '—' },
                  { icon: '👨‍👩‍👧', label: customerDetail.family_size ? `Family of ${customerDetail.family_size}` : '—' },
                  { icon: '🍳', label: customerDetail.specialty_cuisine || '—' },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12.5 }}>
                    <span>{row.icon}</span>
                    <span style={{ color: row.label === '—' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{row.label}</span>
                  </div>
                ))}
              </div>

              {/* Spend */}
              <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>LIFETIME SPEND</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-emerald)' }}>₱{Number(customerDetail.total_lifetime_spend || 0).toLocaleString()}</div>
              </div>

              {/* Tags / Pain points */}
              {painTags.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {painTags.map(tag => (
                      <span key={tag} style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 500 }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Notes</div>
                <textarea className="input" value={noteValue} onChange={e => setNoteValue(e.target.value)}
                  placeholder="Add internal notes about this customer..." style={{ fontSize: 12, minHeight: 80, marginBottom: 8, resize: 'vertical' }} />
                <button className="btn btn-primary btn-sm w-full" onClick={saveNote} disabled={savingNote}>
                  {savingNote ? '⏳ Saving...' : '💾 Save Note'}
                </button>
              </div>
            </>
          ) : (
            /* Orders tab */
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Recent Orders ({customerOrders.length})
              </div>
              {customerOrders.length === 0 ? (
                <div className="empty-state" style={{ padding: 30 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                  <p>No orders yet</p>
                </div>
              ) : customerOrders.map(order => (
                <div key={order.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className={`badge ${statusCls(order.status)}`} style={{ fontSize: 10 }}>{order.status}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                  </div>
                  {(order.order_items || []).map((item, i) => (
                    <div key={i} style={{ fontSize: 12, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 6 }}>
                        ×{item.quantity} {item.product_name}
                      </span>
                      <span style={{ color: 'var(--accent-emerald)', flexShrink: 0, fontWeight: 600 }}>₱{Number(item.unit_price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{order.payment_method}</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>₱{Number(order.total_amount).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
