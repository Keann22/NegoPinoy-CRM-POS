'use client';

import React, { useState } from 'react';
import { Send, Zap, ChevronUp } from 'lucide-react';

interface ChatComposerProps {
  onSendMessage: (text: string) => Promise<void>;
  disabled?: boolean;
}

const CANNED_RESPONSES = [
  {
    label: '💳 GCash Info',
    text: 'Hello po! For GCash payment:\nAccount Name: Negosyanteng Pinoy\nAccount Number: 09XX-XXX-XXXX\nPlease send screenshot of receipt once paid po. Salamat!',
  },
  {
    label: '🚚 Shipping Policy',
    text: 'Standard delivery via SPX Express:\nMetro Manila: 2-3 days\nProvincial: 4-7 days\nCash on Delivery (COD) is available po!',
  },
  {
    label: '🔥 Induction Ready',
    text: 'Yes po! Lahat po ng cookware items natin dito ay 100% Induction-ready and safe sa gas stove or electric stove.',
  },
  {
    label: '📦 Order Confirmation',
    text: 'Salamat po sa order! Na-process na po namin ang inyong package and ipapack na po ng aming warehouse team.',
  },
];

export function ChatComposer({ onSendMessage, disabled = false }: ChatComposerProps) {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);

  const handleSend = async () => {
    if (!inputText.trim() || isSending || disabled) return;
    setIsSending(true);
    try {
      await onSendMessage(inputText.trim());
      setInputText('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const applySnippet = (text: string) => {
    setInputText((prev) => (prev ? `${prev}\n${text}` : text));
    setShowQuickReplies(false);
  };

  return (
    <div className="border-t border-border bg-card/80 p-3 space-y-2 shrink-0">
      {/* Quick Canned Snippets Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 shrink-0 mr-1">
            <Zap className="w-3 h-3 text-amber-500" />
            Quick:
          </span>
          {CANNED_RESPONSES.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => applySnippet(r.text)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground shrink-0 border border-border/50 transition-all active:scale-95"
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowQuickReplies(!showQuickReplies)}
          className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted shrink-0 text-xs"
          title="Toggle snippet selector"
        >
          <ChevronUp
            className={`w-4 h-4 transition-transform ${showQuickReplies ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Input Box & Action */}
      <div className="flex items-end gap-2 bg-background border border-input rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSending}
          placeholder="Type your reply here... (Press Enter to send, Shift+Enter for newline)"
          rows={2}
          className="flex-1 bg-transparent border-0 resize-none text-xs focus:outline-none placeholder:text-muted-foreground/60 text-foreground"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!inputText.trim() || isSending || disabled}
          className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl shadow-xs transition-all shrink-0 active:scale-95 flex items-center justify-center"
          title="Send reply"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
