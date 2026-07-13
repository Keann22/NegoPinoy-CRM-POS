'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { OrderSearch, type OrderResult } from '@/components/dashboard/order-search';
import { ProductSearch, type Product } from '@/components/dashboard/inventory/product-search';
import { StaffSearch } from '@/components/dashboard/staff-search';

interface MessageStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MessageStaffDialog({ open, onOpenChange }: MessageStaffDialogProps) {
  const { toast } = useToast();
  const { userProfile } = useUserProfile();

  const [issueType, setIssueType] = useState<'order' | 'product'>('order');
  const [selectedOrder, setSelectedOrder] = useState<OrderResult | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const resetForm = () => {
    setIssueType('order');
    setSelectedOrder(null);
    setSelectedProduct(null);
    setRecipients([]);
    setMessage('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const canSend =
    message.trim().length > 0 &&
    recipients.length > 0 &&
    (issueType === 'order' ? !!selectedOrder : !!selectedProduct);

  const handleSend = async () => {
    if (!canSend) return;

    setIsSending(true);
    try {
      const senderName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Staff';
      const roles = userProfile?.roles || [];
      const senderRole = roles.some(r => String(r).toLowerCase() === 'sales')
        ? 'sales'
        : roles.some(r => String(r).toLowerCase() === 'inventory')
        ? 'inventory'
        : 'staff';

      const res = await fetch('/api/staff-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueType,
          orderId: issueType === 'order' ? selectedOrder?.id : undefined,
          productId: issueType === 'product' ? selectedProduct?.id : undefined,
          message: message.trim(),
          senderName,
          senderRole,
          recipientNames: recipients,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to send message');
      }

      toast({ title: 'Message sent', description: `Tagged ${recipients.join(', ')}.` });
      handleOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error sending message', description: e.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Message Staff</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>What is this about?</Label>
            <RadioGroup
              value={issueType}
              onValueChange={(v) => {
                setIssueType(v as 'order' | 'product');
                setSelectedOrder(null);
                setSelectedProduct(null);
              }}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="order" id="issue-order" />
                <Label htmlFor="issue-order" className="cursor-pointer font-normal">Order Issue</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="product" id="issue-product" />
                <Label htmlFor="issue-product" className="cursor-pointer font-normal">Product Issue</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>{issueType === 'order' ? 'Which order?' : 'Which product?'}</Label>
            {issueType === 'order' ? (
              <OrderSearch onOrderSelect={setSelectedOrder} />
            ) : (
              <ProductSearch onProductSelect={setSelectedProduct} />
            )}
            {issueType === 'order' && selectedOrder && (
              <p className="text-xs text-muted-foreground">
                Selected: Order #{selectedOrder.id.substring(0, 7).toUpperCase()} — {selectedOrder.customers?.full_name || 'Unknown Customer'}
              </p>
            )}
            {issueType === 'product' && selectedProduct && (
              <p className="text-xs text-muted-foreground">Selected: {selectedProduct.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tag staff</Label>
            <StaffSearch selected={recipients} onChange={setRecipients} />
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              placeholder="What do you want to tell them?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSend} disabled={!canSend || isSending} className="gap-2">
            <Send className="h-4 w-4" />
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
