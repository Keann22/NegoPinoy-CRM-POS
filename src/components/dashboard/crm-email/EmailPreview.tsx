'use client';

import { useState } from 'react';
import { Eye, Send, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { CrmEmailRecipient } from '@/types/crm-email.types';

interface EmailPreviewProps {
  subject: string;
  body: string;
  recipients: CrmEmailRecipient[];
  isSending: boolean;
  onSend: () => Promise<boolean>;
}

export function EmailPreview({
  subject,
  body,
  recipients,
  isSending,
  onSend,
}: EmailPreviewProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const sampleRecipient = recipients[0] || {
    name: 'Juan Dela Cruz',
    sukiTier: 'VIP',
    email: 'juan@example.com',
  };

  const previewSubject = subject
    .replace(/\{\{name\}\}/gi, sampleRecipient.name)
    .replace(/\{\{tier\}\}/gi, sampleRecipient.sukiTier || 'Customer')
    .replace(/\{\{email\}\}/gi, sampleRecipient.email);

  const previewBody = body
    .replace(/\{\{name\}\}/gi, sampleRecipient.name)
    .replace(/\{\{tier\}\}/gi, sampleRecipient.sukiTier || 'Customer')
    .replace(/\{\{email\}\}/gi, sampleRecipient.email);

  const handleConfirmSend = async () => {
    setIsConfirmOpen(false);
    await onSend();
  };

  return (
    <Card className="border shadow-sm flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              3. Live Preview & Send
            </CardTitle>
            <CardDescription className="text-xs">
              Preview how your email looks to a customer.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[11px] font-normal">
            Sample: {sampleRecipient.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col justify-between pt-1">
        {/* Mockup email frame */}
        <div className="rounded-lg border bg-muted/20 overflow-hidden shadow-xs text-xs">
          {/* Email Header bar */}
          <div className="bg-slate-900 text-white p-3 flex items-center justify-between">
            <span className="font-bold tracking-tight">
              NegoPinoy <span className="text-amber-400 font-normal">CRM</span>
            </span>
            <span className="text-[10px] text-slate-400">Preview</span>
          </div>

          <div className="p-3 border-b bg-card space-y-1">
            <div className="text-muted-foreground flex items-center gap-2">
              <span className="font-medium text-foreground w-12">To:</span>
              <span className="font-mono text-[11px]">{sampleRecipient.email}</span>
            </div>
            <div className="text-muted-foreground flex items-center gap-2">
              <span className="font-medium text-foreground w-12">Subject:</span>
              <span className="font-semibold text-foreground text-xs">{previewSubject || '(No Subject)'}</span>
            </div>
          </div>

          {/* Email message body */}
          <div className="p-4 bg-background min-h-[160px] whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {previewBody || <span className="text-muted-foreground italic">Email body is empty...</span>}
          </div>

          {/* Mock footer */}
          <div className="p-2.5 bg-muted/40 text-center text-[10px] text-muted-foreground border-t">
            Negosyanteng Pinoy Store Notification • Auto-formatted HTML
          </div>
        </div>

        {/* Action Button & Confirmation */}
        <div className="pt-2">
          <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                className="w-full gap-2 font-medium"
                size="lg"
                disabled={isSending || recipients.length === 0 || !subject.trim() || !body.trim()}
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending Email...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send to {recipients.length} Recipient{recipients.length === 1 ? '' : 's'}
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  Confirm Email Dispatch
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2 pt-2 text-sm text-foreground/80">
                  <p>
                    You are about to send this email to{' '}
                    <strong className="text-foreground">{recipients.length}</strong> customer
                    {recipients.length === 1 ? '' : 's'}.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Subject: <em>{previewSubject}</em>
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmSend} className="bg-primary">
                  Confirm & Send
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
