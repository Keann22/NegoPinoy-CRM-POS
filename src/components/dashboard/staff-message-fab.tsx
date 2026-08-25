'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowLeft, MessageSquarePlus, Send } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useStaffDirectory, type StaffUser } from '@/hooks/useStaffDirectory';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { avatarColor, initials } from '@/lib/utils/messages';
import { cn } from '@/lib/utils';

/**
 * Floating compose button — a quick way to start a direct message from any
 * dashboard page without navigating away. Pick a colleague, type, send: the
 * 1:1 thread is found-or-created and the message posted in place. The header
 * MessagesDrawer is the inbox; this button is compose-only.
 */
export function StaffMessageFab() {
  const { userProfile } = useUserProfile();
  const { staff, isLoading } = useStaffDirectory();
  const { toast } = useToast();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState<StaffUser | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const myId = userProfile?.id;
  const myName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '';

  const reset = () => {
    setRecipient(null);
    setMessage('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    setOpen(next);
  };

  const handleSend = async () => {
    if (!recipient || !message.trim() || !myId || isSending) return;
    setIsSending(true);
    try {
      // Find or create the 1:1 direct thread, then post into it.
      const dmRes = await fetch('/api/messages/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: myId,
          userName: myName,
          otherUserId: recipient.id,
          otherUserName: recipient.fullName,
        }),
      });
      if (!dmRes.ok) {
        const body = await dmRes.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to start conversation');
      }
      const { issueId } = await dmRes.json();

      const roles = userProfile?.roles || [];
      const senderRole = roles.some((r) => String(r).toLowerCase() === 'sales')
        ? 'sales'
        : roles.some((r) => String(r).toLowerCase() === 'inventory')
        ? 'inventory'
        : 'staff';

      const sendRes = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId,
          senderId: myId,
          senderName: myName,
          senderRole,
          message: message.trim(),
          requiresAttention: false,
          mentions: [],
        }),
      });
      if (!sendRes.ok) {
        const body = await sendRes.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to send message');
      }

      toast({ title: 'Message sent', description: `Sent to ${recipient.fullName}.` });
      handleOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error sending message', description: e.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  // The messages page has its own composer — no floating shortcut needed there.
  if (pathname === '/dashboard/messages') return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
      >
        <MessageSquarePlus className="h-6 w-6" />
        <span className="sr-only">New message</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {recipient && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -ml-1"
                  onClick={() => setRecipient(null)}
                  title="Choose someone else"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {recipient ? `Message ${recipient.fullName}` : 'New direct message'}
            </DialogTitle>
          </DialogHeader>

          {!recipient ? (
            <Command className="rounded-md border">
              <CommandInput placeholder="Message who?" />
              <CommandList>
                <CommandEmpty>{isLoading ? 'Loading staff…' : 'No staff found.'}</CommandEmpty>
                <CommandGroup>
                  {staff.map((s) => (
                    <CommandItem key={s.id} value={s.fullName} onSelect={() => setRecipient(s)}>
                      <span
                        className={cn(
                          'mr-2 h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-semibold',
                          avatarColor(s.fullName)
                        )}
                      >
                        {initials(s.fullName)}
                      </span>
                      <span className="flex flex-col">
                        <span>{s.fullName}</span>
                        {s.roles.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">{s.roles.join(', ')}</span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          ) : (
            <div className="space-y-3">
              <Textarea
                autoFocus
                placeholder={`Write a message to ${recipient.fullName}…`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className="flex justify-end">
                <Button onClick={handleSend} disabled={!message.trim() || isSending} className="gap-2">
                  <Send className="h-4 w-4" />
                  {isSending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
