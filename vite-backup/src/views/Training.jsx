import React, { useEffect, useState } from 'react';
import { supabase, callFunction } from '../lib/supabase.js';

export default function Training() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const fetchFaqs = async () => {
    setLoading(true);
    const { data } = await supabase.from('pending_faqs').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    setFaqs(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchFaqs(); }, []);

  const handleAnswerChange = (id, newAnswer) => {
    setFaqs(prev => prev.map(f => f.id === id ? { ...f, suggested_answer: newAnswer } : f));
  };

  const handleApprove = async (faq) => {
    setProcessingId(faq.id);
    try {
      await callFunction('faq-approve', { id: faq.id, question: faq.suggested_question, answer: faq.suggested_answer });
      setFaqs(prev => prev.filter(f => f.id !== faq.id));
    } catch (err) { alert('Failed: ' + err.message); }
    setProcessingId(null);
  };

  const handleDiscard = async (id) => {
    if (!confirm('Discard this FAQ suggestion?')) return;
    setProcessingId(id);
    await supabase.from('pending_faqs').delete().eq('id', id);
    setFaqs(prev => prev.filter(f => f.id !== id));
    setProcessingId(null);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="section-title">🧠 FAQ Approval Queue</div>
          <div className="section-sub">{faqs.length} pending reviews — approve to train the AI</div>
        </div>
        <button className="refresh-btn" onClick={fetchFaqs} disabled={loading}>🔄</button>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : faqs.length === 0 ? (
        <div className="empty-state" style={{ border: '2px dashed var(--border)', borderRadius: 16, padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h3>Knowledge Base is Healthy</h3>
          <p>All recent interactions have been processed.</p>
        </div>
      ) : faqs.map(faq => (
        <div key={faq.id} className="faq-card">
          <div className="faq-q">
            <div className="text-xs text-muted font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>💬 Customer Question</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{faq.suggested_question}</div>
          </div>
          <div className="faq-a">
            <div className="text-xs text-muted font-bold mb-2" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>🤖 AI Draft Answer (Editable)</div>
            <textarea 
              value={faq.suggested_answer}
              onChange={(e) => handleAnswerChange(faq.id, e.target.value)}
              style={{ 
                fontSize: 13.5, 
                color: 'var(--text-secondary)', 
                lineHeight: 1.6,
                width: '100%',
                minHeight: '80px',
                backgroundColor: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px',
                resize: 'vertical',
                outline: 'none'
              }}
            />
          </div>
          <div className="faq-actions">
            <div className="text-xs text-muted" style={{ marginRight: 'auto', display: 'flex', alignItems: 'center' }}>
              📅 {new Date(faq.created_at).toLocaleDateString('en-PH')}
            </div>
            <button className="btn btn-danger btn-sm" disabled={processingId === faq.id} onClick={() => handleDiscard(faq.id)}>🗑 Discard</button>
            <button className="btn btn-primary btn-sm" disabled={processingId === faq.id} onClick={() => handleApprove(faq)}>
              {processingId === faq.id ? '⏳ Training...' : '✅ Approve & Train AI'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
