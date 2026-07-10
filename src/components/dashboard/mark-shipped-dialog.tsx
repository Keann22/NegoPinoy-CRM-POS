'use client';

import { useState } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { resolveOpenOrderIssues } from '@/lib/services/order-service';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface MarkShippedDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    currentTrackingNumber?: string;
    onSuccess: () => void;
}

export function MarkShippedDialog({
    open,
    onOpenChange,
    orderId,
    currentTrackingNumber = '',
    onSuccess
}: MarkShippedDialogProps) {
    const supabase = useSupabase();
    const { toast } = useToast();
    const [trackingNumber, setTrackingNumber] = useState(currentTrackingNumber);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;

        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('orders')
                .update({
                    status: 'Shipped',
                    tracking_number: trackingNumber || null
                })
                .eq('id', orderId);

            if (error) throw error;

            await resolveOpenOrderIssues(supabase, orderId);

            toast({
                title: "Order Updated",
                description: "The order has been marked as shipped.",
            });

            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            console.error("Error updating order:", error);
            toast({
                variant: "destructive",
                title: "Failed to update order",
                description: error.message || "Something went wrong.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Mark as Shipped</DialogTitle>
                        <DialogDescription>
                            Enter the tracking number for this order. The status will be updated to "Shipped".
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="trackingNumber">Tracking Number (Optional)</Label>
                            <Input
                                id="trackingNumber"
                                placeholder="e.g. JNT1234567890"
                                value={trackingNumber}
                                onChange={(e) => setTrackingNumber(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Tracking & Ship
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
