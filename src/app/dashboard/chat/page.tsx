'use client';

import React, { useState } from 'react';
import { RefreshCw, MessageCircle, User, Brain, Clock, Bot } from 'lucide-react';
import { useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';

export default function ChatHistoryPage() {
  const [selectedCustomerPsid, setSelectedCustomerPsid] = useState<string | null>(null);
  
  const supabase = useSupabase();
  const [chatLogs, setChatLogs] = useState<any[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    const fetch = async () => {
      setLoadingChats(true);
      try {
        const { data, error } = await supabase
          .from('conversation_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2500);
        if (error) throw error;
        setChatLogs(data || []);
      } catch (err) { console.error('chat fetch error:', err); }
      finally { setLoadingChats(false); }
    };
    fetch();
  }, [supabase]);

  const chatSidebarItems = React.useMemo(() => {
    if (!chatLogs || !Array.isArray(chatLogs)) return [];
    const map = new Map();
    chatLogs.forEach(log => {
      const psid = log?.customer_psid || log?.customerPsid;
      if (psid && !map.has(psid)) {
        const msgText = log?.message_text || log?.messageText || '';
        const dateVal = log?.created_at || log?.createdAt;
        map.set(psid, {
          psid: String(psid),
          fullName: String(psid).startsWith('test') ? 'Customer test' : (log?.customer_name || log?.customerName || 'Customer ' + String(psid).slice(0, 5)),
          lastMessage: msgText,
          lastDate: dateVal ? new Date(dateVal) : new Date()
        });
      }
    });
    return Array.from(map.values());
  }, [chatLogs]);

  const activeChatMessages = React.useMemo(() => {
    if (!selectedCustomerPsid || !chatLogs || !Array.isArray(chatLogs)) return [];
    return chatLogs
      .filter(log => String(log?.customer_psid || log?.customerPsid) === String(selectedCustomerPsid))
      .sort((a, b) => {
        const tA = new Date(a?.created_at || a?.createdAt || 0).getTime();
        const tB = new Date(b?.created_at || b?.createdAt || 0).getTime();
        return (tA || 0) - (tB || 0);
      });
  }, [chatLogs, selectedCustomerPsid]);

  return (
    <div className="max-w-6xl mx-auto h-[700px] flex flex-col py-8">
      <div className="mb-6 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-3xl font-bold mb-2">Chat History</h2>
          <p className="text-muted-foreground">Review raw conversation logs between customers and admins/AI.</p>
        </div>
        <button 
          disabled={loadingChats}
          className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${loadingChats ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      <div className="flex-1 bg-card border rounded-3xl overflow-hidden shadow-2xl flex min-h-0">
        {/* Left Sidebar */}
        <div className="w-1/3 border-r flex flex-col bg-slate-50 dark:bg-slate-900/50">
          <div className="p-4 border-b bg-card">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center">
              <MessageCircle className="w-4 h-4 mr-2" /> Recent Conversations
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingChats ? (
              <div className="p-8 text-center text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" />
                Loading logs...
              </div>
            ) : chatSidebarItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No conversations recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {chatSidebarItems.map((item) => (
                  <button
                    key={item.psid}
                    onClick={() => setSelectedCustomerPsid(item.psid)}
                    className={`w-full text-left p-4 transition-all hover:bg-slate-100 dark:hover:bg-slate-800 ${selectedCustomerPsid === item.psid ? 'bg-slate-200 dark:bg-slate-800/80 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold truncate pr-2">{item.fullName}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-1 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {item.lastDate.toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{item.lastMessage}</div>
                    <div className="text-[10px] font-mono mt-1 opacity-50">ID: {item.psid.slice(0, 8)}...</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col bg-background">
          {selectedCustomerPsid ? (
            <>
              <div className="p-4 border-b bg-card shadow-sm z-10 flex items-center">
                <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mr-3">
                  <User className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-bold">{chatSidebarItems.find(i => i.psid === selectedCustomerPsid)?.fullName || 'Unknown User'}</h3>
                  <p className="text-xs text-muted-foreground font-mono">PSID: {selectedCustomerPsid}</p>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {activeChatMessages.map((msg, index) => {
                  const senderType = msg?.sender_type || msg?.senderType || '';
                  const isCustomer = senderType === 'customer';
                  const isBot = senderType === 'bot';
                  const msgText = msg?.message_text || msg?.messageText || '';
                  const createdAtVal = msg?.created_at || msg?.createdAt;
                  const timeStr = createdAtVal ? new Date(createdAtVal).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
                  const keyId = msg?.id || String(index);
                  
                  return (
                    <div key={keyId} className={`flex gap-4 ${isCustomer ? 'justify-start' : 'justify-end'}`}>
                      {isCustomer && (
                        <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center shrink-0 border mt-1">
                          <User className="w-4 h-4 text-slate-500" />
                        </div>
                      )}
                      
                      <div className={`max-w-[75%] px-5 py-3.5 shadow-sm ${
                        isCustomer 
                          ? 'bg-card border text-foreground rounded-2xl rounded-tl-none' 
                          : isBot 
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-2xl rounded-tr-none'
                            : 'bg-blue-600 text-white rounded-2xl rounded-tr-none shadow-blue-600/20'
                      }`}>
                        <div className="flex items-center justify-between mb-1 opacity-60 space-x-4">
                          <span className="text-[10px] font-bold uppercase tracking-wider">
                            {isCustomer ? 'Customer' : isBot ? 'AI System (Silent)' : 'Human Admin'}
                          </span>
                          <span className="text-[10px]">{timeStr}</span>
                        </div>
                        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isBot ? 'font-mono' : ''}`}>
                          {msgText}
                        </p>
                      </div>
                      
                      {!isCustomer && (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border mt-1 ${
                          isBot ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-blue-500/20 border-blue-500/30'
                        }`}>
                          {isBot ? <Bot className="w-4 h-4 text-emerald-500" /> : <Brain className="w-4 h-4 text-blue-500" />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="w-12 h-12 mb-4 opacity-20" />
              <p>Select a conversation from the sidebar to view history.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
