'use client';

import React, { useState } from 'react';
import { RefreshCw, CheckCircle, Database, Trash2, User, Bot } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEffect } from 'react';

export default function ApprovalQueuePage() {
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  const supabase = createClient();
  const [pendingFaqs, setPendingFaqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('pending_faqs').select('*');
        if (error) throw error;
        setPendingFaqs(data || []);
      } catch (err) { console.error('fetch error:', err); }
      finally { setLoading(false); }
    };
    fetch();
  }, [supabase, refetchTrigger]);

  const handleVerify = async (question: string, answer: string, id: string) => {
    setProcessingId(id);
    try {
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || '';
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, question, answer })
      });

      if (!response.ok) throw new Error('Failed to verify FAQ');

      // The backend should handle deletion, or we can optimistic delete here
      setRefetchTrigger(n => n + 1);
    } catch (error) {
      console.error('Verification failed:', error);
      alert('Action failed. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDiscard = async (id: string) => {
    if (!window.confirm('Are you sure you want to discard this suggestion?')) return;
    setProcessingId(id);
    try {
      const { error } = await supabase.from('pending_faqs').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Discard failed:', error);
      alert('Failed to discard. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const pending = pendingFaqs?.filter(f => f.status === 'pending') || [];

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold mb-1">Knowledge Verification</h2>
          <p className="text-muted-foreground text-sm">Review real customer conversations to expand the chatbot&apos;s brain.</p>
        </div>
        <button 
          disabled={loading}
          className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground font-medium animate-pulse">Scanning database for updates...</p>
        </div>
      ) : pending.length === 0 ? (
        <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-16 text-center max-w-2xl mx-auto bg-slate-50 dark:bg-slate-900/50">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="text-2xl font-bold mb-3">Knowledge Base is Healthy</h3>
          <p className="text-muted-foreground">All recent interactions have been processed. The AI is fully up to date with its current training data.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {pending.map((faq) => (
            <div key={faq.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-md bg-card transition-all">
              <div className="p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="p-2 bg-blue-500/10 rounded-lg shrink-0 mt-1">
                    <User className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500 block mb-1">Customer Question</span>
                    <h3 className="text-lg font-semibold leading-relaxed">{faq.suggested_question}</h3>
                  </div>
                </div>
                
                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 border flex items-start gap-4">
                  <div className="p-2 bg-emerald-500/10 rounded-lg shrink-0 mt-1">
                    <Bot className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 block mb-1">AI Draft Answer</span>
                    <p className="whitespace-pre-wrap leading-relaxed">{faq.suggested_answer}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-900/50 px-8 py-5 border-t flex items-center justify-between">
                <div className="flex items-center text-xs text-muted-foreground">
                  <Database className="w-3.5 h-3.5 mr-2" />
                  Captured {new Date(faq.created_at).toLocaleDateString()}
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => handleDiscard(faq.id)}
                    disabled={processingId === faq.id}
                    className="flex items-center px-4 py-2.5 text-rose-500 font-medium rounded-xl transition-all active:scale-95 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Discard
                  </button>
                  <button
                    onClick={() => handleVerify(faq.suggested_question, faq.suggested_answer, faq.id)}
                    disabled={processingId === faq.id}
                    className="flex items-center px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                  >
                    {processingId === faq.id ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Approve & Train AI
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
