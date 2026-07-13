'use client';

import React, { useState } from 'react';
import { User, Send, Brain, Bot, Save, RefreshCw, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function SimulatorPage() {
  const [testQuestion, setTestQuestion] = useState('');
  const [simAnswer, setSimAnswer] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [lastQuestion, setLastQuestion] = useState('');

  const handleVerify = async (question: string, answer: string) => {
    setIsTraining(true);
    try {
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || '';
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer })
      });

      if (!response.ok) throw new Error('Failed to verify FAQ');

      alert('Training successful! The AI now knows this answer.');
      setSimAnswer('');
      setTestQuestion('');
      setLastQuestion('');
    } catch (error) {
      console.error('Verification failed:', error);
      alert('Action failed. Please try again.');
    } finally {
      setIsTraining(false);
    }
  };

  const runSimulator = async () => {
    if (!testQuestion.trim()) return;
    setIsSimulating(true);
    setSimAnswer('');
    setLastQuestion(testQuestion);
    
    try {
      const simUrl = process.env.NEXT_PUBLIC_N8N_SIMULATOR_URL || '';
      const response = await fetch(simUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testQuestion })
      });
      
      const data = await response.json();
      setSimAnswer(data.answer || 'No answer received.');
    } catch (error) {
      console.error('Simulator error:', error);
      setSimAnswer('Error calling simulator. Check console.');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold mb-2">AI Simulation Lab</h2>
        <p className="text-muted-foreground">Ask a question to see how the bot would respond. Edit the answer and click &quot;Train&quot; to improve its brain instantly.</p>
      </div>

      <Card className="overflow-hidden flex flex-col min-h-[600px] border-slate-200 dark:border-slate-800">
        <div className="flex-1 p-8 space-y-8 overflow-y-auto max-h-[500px]">
          {lastQuestion && (
            <div className="flex justify-end gap-4">
              <div className="max-w-[80%] bg-blue-600 text-white px-6 py-4 rounded-2xl rounded-tr-none shadow-xl">
                <p className="text-sm font-medium leading-relaxed">{lastQuestion}</p>
              </div>
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center shrink-0 border">
                <User className="w-5 h-5" />
              </div>
            </div>
          )}

          {(simAnswer || isSimulating) && (
            <div className="flex justify-start gap-4">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shrink-0 border border-blue-400">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 max-w-[85%]">
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-none overflow-hidden transition-all focus-within:ring-2 focus-within:ring-blue-500/50">
                  {isSimulating ? (
                    <div className="p-6 flex items-center space-x-3">
                      <span className="text-sm font-medium text-slate-400">AI is thinking...</span>
                    </div>
                  ) : (
                    <>
                      <textarea 
                        value={simAnswer}
                        onChange={(e) => setSimAnswer(e.target.value)}
                        className="w-full bg-transparent p-6 text-sm leading-relaxed focus:outline-none resize-none min-h-[150px]"
                        placeholder="Type answer here..."
                      />
                      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center">
                          <MessageSquare className="w-3 h-3 mr-1.5" /> Editable AI Draft
                        </span>
                        <button 
                          onClick={() => handleVerify(lastQuestion, simAnswer)}
                          disabled={isTraining}
                          className="flex items-center px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50"
                        >
                          {isTraining ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
                          Train AI with this Answer
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 pt-0 mt-auto">
          <div className="relative group">
            <input 
              type="text" 
              value={testQuestion}
              onChange={(e) => setTestQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSimulator()}
              placeholder="Type a test question for the AI..."
              className="w-full border border-slate-300 dark:border-slate-700 bg-background text-foreground pl-6 pr-16 py-5 rounded-3xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all text-lg"
            />
            <button 
              onClick={runSimulator}
              disabled={isSimulating || !testQuestion.trim()}
              className="absolute right-3 top-3 bottom-3 w-12 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 text-white rounded-2xl flex items-center justify-center transition-all active:scale-90"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Brain className="w-3 h-3 inline mr-1" /> This uses your Production Groq Engine for 100% accurate simulation.
          </p>
        </div>
      </Card>
    </div>
  );
}
