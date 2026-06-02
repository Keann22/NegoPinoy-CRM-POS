import React, { useEffect, useState, useCallback } from 'react';
import { supabase, callFunction } from '../lib/supabase.js';

function StatusBadge({ status }) {
  const map = { Pending: 'badge-pending', Paid: 'badge-paid', Shipped: 'badge-shipped', Cancelled: 'badge-cancelled' };
  return <span className={`badge ${map[status] || 'badge-pending'}`}>{status}</span>;
}

export default function POS({ initialTab = 'pos' }) {
  const [tab, setTab] = useState(initialTab === 'orders' ? 'orders' : 'pos');

  // POS state
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [shippingFee, setShippingFee] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);

  // Orders state
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState({});

  const searchProducts = useCallback(async (q) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('products')
      .select('id, name, price, category, is_induction_ready')
      .textSearch('search_vector', q, { type: 'websearch' })
      .limit(8);
    setSearchResults(data || []);
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(productSearch), 350);
    return () => clearTimeout(t);
  }, [productSearch, searchProducts]);

  const searchCustomers = useCallback(async (q) => {
    if (!q.trim()) { setCustomerResults([]); return; }
    const { data } = await supabase
      .from('customers')
      .select('id, full_name, psid, suki_tier, mobile_number')
      .ilike('full_name', `%${q}%`)
      .limit(5);
    setCustomerResults(data || []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

  const addToCart = (product) => {
    const price = parseFloat(String(product.price).replace(/[^0-9.]/g, '')) || 0;
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: product.id, name: product.name, price, qty: 1 }];
    });
    setProductSearch('');
    setSearchResults([]);
  };

  const updateQty = (id, delta) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  const removeItem = (id) => setCart(prev => prev.filter(i => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + (parseFloat(shippingFee) || 0);

  const handleSubmitOrder = async () => {
    if (!selectedCustomer || cart.length === 0) return;
    setSubmitting(true);
    try {
      const result = await callFunction('pos-create-order', {
        customer_id: selectedCustomer.id,
        items: cart.map(i => ({ product_id: i.id, product_name: i.name, quantity: i.qty, unit_price: i.price })),
        payment_method: paymentMethod,
        shipping_fee: parseFloat(shippingFee) || 0,
        notes,
      });
      setOrderSuccess(result);
      setCart([]);
      setSelectedCustomer(null);
      setCustomerSearch('');
      setNotes('');
      setShippingFee('');
    } catch (err) {
      alert('Order failed: ' + err.message);
    }
    setSubmitting(false);
  };

  const fetchOrders = async () => {
    setLoadingOrders(true);
    const { data } = await supabase
      .from('orders')
      .select('*, customers(full_name, suki_tier)')
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoadingOrders(false);
  };

  useEffect(() => { if (tab === 'orders') fetchOrders(); }, [tab]);

  const loadOrderItems = async (orderId) => {
    if (orderItems[orderId]) { setExpandedOrder(expandedOrder === orderId ? null : orderId); return; }
    const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId);
    setOrderItems(prev => ({ ...prev, [orderId]: data || [] }));
    setExpandedOrder(orderId);
  };

  const updateOrderStatus = async (orderId, status) => {
    await supabase.from('orders').update({ status }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  };

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button className={`btn ${tab === 'pos' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('pos')}>🛒 New Order</button>
        <button className={`btn ${tab === 'orders' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('orders')}>📦 Order History</button>
      </div>

      {tab === 'pos' && (
        <div className="pos-layout">
          <div>
            {orderSuccess && (
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="font-bold text-emerald">✅ Order Created!</div>
                  <div className="text-sm text-muted mt-1">Customer tier updated to: <strong style={{ color: 'var(--accent-amber)' }}>{orderSuccess.new_tier}</strong></div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setOrderSuccess(null)}>✕</button>
              </div>
            )}

            <div className="card mb-4">
              <div className="card-header"><span className="card-title">👤 Customer</span></div>
              <div className="card-body">
                {selectedCustomer ? (
                  <div className="flex items-center justify-between" style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div>
                      <div className="font-semibold">{selectedCustomer.full_name}</div>
                      <div className="text-xs text-muted">{selectedCustomer.suki_tier} · {selectedCustomer.mobile_number || 'No mobile'}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}>Change</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input className="input" placeholder="Search customer by name..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                    {customerResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, marginTop: 4 }}>
                        {customerResults.map(c => (
                          <div key={c.id} className="product-row" onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustomerResults([]); }}>
                            <span>{c.full_name}</span>
                            <span className="text-xs text-muted ml-auto">{c.suki_tier}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">🔍 Add Products</span></div>
              <div className="card-body">
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <input className="input" placeholder="Search from 1,403 products..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                  {searching && <div className="text-xs text-muted mt-1">Searching...</div>}
                </div>
                {searchResults.length > 0 && (
                  <div className="scroll-list">
                    {searchResults.map(p => (
                      <div key={p.id} className="product-row" onClick={() => addToCart(p)}>
                        <div style={{ flex: 1 }}>
                          <div className="text-sm font-semibold">{p.name}</div>
                          <div className="text-xs text-muted">{p.category}{p.is_induction_ready ? ' · ⚡ Induction' : ''}</div>
                        </div>
                        <div className="text-emerald font-bold text-sm">₱{p.price}</div>
                        <span style={{ fontSize: 18, color: 'var(--accent-blue)' }}>+</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{ position: 'sticky', top: 0 }}>
              <div className="card-header">
                <span className="card-title">🧾 Cart</span>
                {cart.length > 0 && <span className="badge badge-regular">{cart.length} items</span>}
              </div>
              <div className="card-body">
                {cart.length === 0 ? (
                  <div className="empty-state" style={{ padding: '30px 0' }}>
                    <div style={{ fontSize: 32 }}>🛒</div>
                    <p>Search products and click to add</p>
                  </div>
                ) : (
                  <>
                    {cart.map(item => (
                      <div key={item.id} className="cart-item">
                        <div style={{ flex: 1 }}>
                          <div className="cart-item-name">{item.name}</div>
                          <div className="cart-item-price">₱{(item.price * item.qty).toLocaleString()}</div>
                        </div>
                        <button className="qty-btn" onClick={() => updateQty(item.id, -1)}>−</button>
                        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                        <button className="qty-btn" onClick={() => updateQty(item.id, 1)}>+</button>
                        <button className="qty-btn" style={{ color: 'var(--accent-rose)' }} onClick={() => removeItem(item.id)}>✕</button>
                      </div>
                    ))}
                    <hr className="divider" />
                    <div className="input-group">
                      <label className="input-label">Payment Method</label>
                      <select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                        {['COD', 'GCash', 'Bank Transfer', 'Maya', 'Cash'].map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="input-group">
                      <label className="input-label">Shipping Fee (₱)</label>
                      <input className="input" type="number" placeholder="0" value={shippingFee} onChange={e => setShippingFee(e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label className="input-label">Notes</label>
                      <textarea className="input" placeholder="Special instructions..." value={notes} onChange={e => setNotes(e.target.value)} style={{ minHeight: 60 }} />
                    </div>
                    <hr className="divider" />
                    <div className="flex justify-between mb-2 text-sm"><span className="text-muted">Subtotal</span><span>₱{subtotal.toLocaleString()}</span></div>
                    <div className="flex justify-between mb-4 text-sm"><span className="text-muted">Shipping</span><span>₱{(parseFloat(shippingFee)||0).toLocaleString()}</span></div>
                    <div className="flex justify-between mb-4" style={{ fontSize: 18, fontWeight: 700 }}><span>Total</span><span className="text-emerald">₱{total.toLocaleString()}</span></div>
                    <button className="btn btn-success w-full" onClick={handleSubmitOrder} disabled={!selectedCustomer || submitting}>
                      {submitting ? '⏳ Creating...' : `✅ Create Order — ₱${total.toLocaleString()}`}
                    </button>
                    {!selectedCustomer && <div className="text-xs text-muted mt-2 text-right">Select a customer first</div>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-muted">{orders.length} orders total</div>
            <button className="refresh-btn" onClick={fetchOrders} disabled={loadingOrders}>🔄</button>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order ID</th><th>Customer</th><th>Amount</th><th>Payment</th><th>Status</th><th>Date</th><th>Change Status</th></tr></thead>
                <tbody>
                  {loadingOrders ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
                  ) : orders.length === 0 ? (
                    <tr><td colSpan="7"><div className="empty-state"><div style={{ fontSize: 40 }}>📦</div><h3>No orders yet</h3><p>Create your first order in the New Order tab</p></div></td></tr>
                  ) : orders.map(o => (
                    <React.Fragment key={o.id}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => loadOrderItems(o.id)}>
                        <td><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.id.slice(0, 8)}…</span></td>
                        <td>
                          <div className="font-semibold">{o.customers?.full_name || 'Unknown'}</div>
                          <span className={`badge ${o.customers?.suki_tier === 'VIP' ? 'badge-vip' : o.customers?.suki_tier === 'Regular' ? 'badge-regular' : 'badge-newbie'}`} style={{ fontSize: 10 }}>{o.customers?.suki_tier || 'Newbie'}</span>
                        </td>
                        <td><span className="text-emerald font-bold">₱{Number(o.total_amount).toLocaleString()}</span></td>
                        <td className="text-sm">{o.payment_method}</td>
                        <td><StatusBadge status={o.status} /></td>
                        <td className="text-sm text-muted">{new Date(o.created_at).toLocaleDateString('en-PH')}</td>
                        <td>
                          <select className="input" style={{ padding: '4px 8px', fontSize: 12 }} value={o.status}
                            onChange={e => { e.stopPropagation(); updateOrderStatus(o.id, e.target.value); }}
                            onClick={e => e.stopPropagation()}>
                            {['Pending', 'Paid', 'Shipped', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                      {expandedOrder === o.id && orderItems[o.id] && (
                        <tr>
                          <td colSpan="7" style={{ background: 'var(--bg-elevated)', padding: '12px 24px' }}>
                            <div className="text-xs text-muted font-bold mb-2" style={{ textTransform: 'uppercase' }}>Order Items</div>
                            {orderItems[o.id].map(item => (
                              <div key={item.id} className="flex justify-between text-sm" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                <span>{item.product_name}</span>
                                <span className="text-muted">×{item.quantity}</span>
                                <span className="text-emerald">₱{(item.unit_price * item.quantity).toLocaleString()}</span>
                              </div>
                            ))}
                            {o.notes && <div className="text-xs text-muted mt-2">📝 {o.notes}</div>}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
