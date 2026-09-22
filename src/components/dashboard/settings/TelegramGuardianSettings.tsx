'use client';

import { useState, useEffect } from 'react';
import { Send, CheckCircle2, AlertCircle, HelpCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';

export function TelegramGuardianSettings() {
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const [status, setStatus] = useState<{ configured: boolean; hasBotToken: boolean; hasChatId: boolean } | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [testBotToken, setTestBotToken] = useState('');
  const [testChatId, setTestChatId] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const canManage = Boolean(userProfile?.roles?.some(r => ['Admin', 'Owner', 'Inventory'].includes(r)));
  if (!canManage) return null;

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/inventory/guardian/telegram');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch Telegram status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    try {
      const res = await fetch('/api/inventory/guardian/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          botToken: testBotToken.trim() || undefined,
          chatId: testChatId.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send test message');
      }

      toast({
        title: 'Test Message Sent! 📱',
        description: 'Check your Telegram app. You should see a test alert from the Inventory Guardian.'
      });
      fetchStatus();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: err.message || 'Make sure the bot token is valid and you clicked /start on your bot.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Send className="h-5 w-5 text-sky-500" />
              Telegram Push Notifications
            </CardTitle>
            <CardDescription>
              Receive instant alerts on your phone whenever stock goes negative or pickers report shortages.
            </CardDescription>
          </div>
          <div>
            {isLoadingStatus ? (
              <Badge variant="outline" className="text-xs animate-pulse">Checking...</Badge>
            ) : status?.configured ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" /> Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 gap-1">
                <AlertCircle className="h-3 w-3" /> Not Configured
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <form onSubmit={handleSendTest} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="botToken" className="text-xs font-semibold">
                Bot Token {status?.hasBotToken && <span className="text-emerald-600 text-[10px]">(Configured in env)</span>}
              </Label>
              <Input
                id="botToken"
                placeholder={status?.hasBotToken ? '••••••••••••••••••••••••' : 'e.g. 7123456789:AAHk...'}
                value={testBotToken}
                onChange={e => setTestBotToken(e.target.value)}
                className="text-xs h-9 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chatId" className="text-xs font-semibold">
                Chat ID {status?.hasChatId && <span className="text-emerald-600 text-[10px]">(Configured in env)</span>}
              </Label>
              <Input
                id="chatId"
                placeholder={status?.hasChatId ? '••••••••••' : 'e.g. 123456789'}
                value={testChatId}
                onChange={e => setTestChatId(e.target.value)}
                className="text-xs h-9 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowInstructions(!showInstructions)}
              className="text-xs text-muted-foreground hover:text-foreground gap-1 p-0 h-auto"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {showInstructions ? 'Hide setup instructions' : 'How do I get my Bot Token & Chat ID?'}
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isTesting || (!status?.configured && (!testBotToken || !testChatId))}
              className="gap-1.5 text-xs h-8"
            >
              {isTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {isTesting ? 'Sending...' : 'Send Test Notification'}
            </Button>
          </div>
        </form>

        {showInstructions && (
          <div className="p-3.5 rounded-lg border bg-muted/40 text-xs space-y-2 text-foreground/90 leading-relaxed">
            <p className="font-semibold text-primary">Quick 2-Minute Telegram Setup (100% Free):</p>
            <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
              <li>Open Telegram on your phone or PC and search for <strong>@BotFather</strong>.</li>
              <li>Type <code>/newbot</code>, give it a name (e.g. <em>NegoPinoy Watchdog</em>) and username ending in <code>bot</code>.</li>
              <li>BotFather will give you an <strong>API Token</strong>. Copy it into the Bot Token field above.</li>
              <li>Click the link to open your new bot and tap <strong>Start</strong> (or send <code>/start</code>).</li>
              <li>Search for <strong>@userinfobot</strong> in Telegram and tap Start to see your numeric <strong>Id</strong> (Chat ID).</li>
              <li>Paste both into the fields above and click <strong>Send Test Notification</strong>!</li>
            </ol>
            <p className="text-[11px] text-muted-foreground pt-1 italic">
              Tip: You can also set <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_CHAT_ID</code> in <code>.env.local</code> for permanent server deployment.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
