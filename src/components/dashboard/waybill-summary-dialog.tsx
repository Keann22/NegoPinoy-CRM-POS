import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRef } from 'react';
import html2canvas from 'html2canvas';

interface WaybillSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any; // We will pass the full order object with spx_sync_data
}

export function WaybillSummaryDialog({ open, onOpenChange, order }: WaybillSummaryDialogProps) {
  const { toast } = useToast();
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!order) return null;

  const spx = order.spx_sync_data || {};
  const addr = order.shippingAddress || {};
  
  const handleCopyImage = async () => {
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, { scale: 2 });
      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Failed to create image');
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        toast({ title: 'Copied to clipboard', description: 'You can now paste the waybill image.' });
      });
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Could not copy image to clipboard.' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] bg-gray-50/50 p-6 flex flex-col items-center">
        
        {/* Actions Bar */}
        <div className="flex w-full justify-end gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={handleCopyImage}>
                <Copy className="h-4 w-4 mr-2" /> Copy as Image
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
        </div>

        {/* Waybill Container (this part is screenshot) */}
        <div ref={receiptRef} className="w-full bg-white p-6 shadow-sm border rounded-sm flex flex-col gap-6 text-sm">
            
            <div className="grid grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="border rounded-md p-4 relative">
                    <div className="absolute -top-3 left-3 bg-white px-1 flex items-center gap-2">
                        <div className="w-1 h-3 bg-red-500 rounded-sm"></div>
                        <span className="font-medium text-gray-700">Basic Info</span>
                    </div>
                    
                    <div className="mt-2 space-y-3">
                        <div className="grid grid-cols-[130px_1fr] items-center text-gray-600">
                            <span className="text-right pr-4">Tracking Number :</span>
                            <span className="font-semibold text-gray-900">{order.tracking_number || '-'}</span>
                        </div>
                        <div className="grid grid-cols-[130px_1fr] items-center text-gray-600">
                            <span className="text-right pr-4">Service Type :</span>
                            <span className="text-gray-900">{spx.service_type || 'Standard Service'}</span>
                        </div>
                        <div className="grid grid-cols-[130px_1fr] items-center text-gray-600">
                            <span className="text-right pr-4">Collect Type :</span>
                            <span className="text-gray-900">{spx.collect_type || 'Pickup'}</span>
                        </div>
                        <div className="grid grid-cols-[130px_1fr] items-center text-gray-600">
                            <span className="text-right pr-4">Pickup Time :</span>
                            <span className="text-gray-900">{spx.scheduled_pickup_time || '-'}</span>
                        </div>
                        <div className="grid grid-cols-[130px_1fr] items-center text-gray-600">
                            <span className="text-right pr-4">COD Amount (DEBUG) :</span>
                            <span className="font-semibold text-gray-900">₱{(spx.cod_amount !== undefined ? Number(spx.cod_amount) : Number(order.amountPaid || order.totalAmount || 0)) + Number(spx.estimated_shipping_fee || 0)}</span>
                        </div>
                    </div>
                </div>

                {/* Payment Info */}
                <div className="border rounded-md relative pt-6 pb-4 px-4 bg-white min-h-[160px]">
                    <div className="absolute -top-3 left-3 bg-white px-2 flex items-center gap-2">
                        <div className="w-1 h-3.5 bg-red-500 rounded-sm"></div>
                        <span className="font-semibold text-slate-700">Payment Info</span>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="grid grid-cols-[120px_1fr] items-center text-sm gap-2">
                            <span className="text-slate-500 text-right leading-tight">Shipping Fee (DEBUG) :</span>
                            <span className="font-medium text-red-500">₱{spx.estimated_shipping_fee || 0}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Receiver Info */}
            <div className="border rounded-md p-4 relative">
                <div className="absolute -top-3 left-3 bg-white px-1 flex items-center gap-2">
                    <div className="w-1 h-3 bg-red-500 rounded-sm"></div>
                    <span className="font-medium text-gray-700">Receiver Info</span>
                </div>
                
                <div className="mt-2 space-y-1">
                    <div className="text-gray-900">
                        {order.shippingName || 'Unknown Customer'}, {order.shippingPhone || 'No Phone Number'}
                    </div>
                    <div className="text-gray-500 text-sm">
                        {addr.address_line || `${addr.street_address || ''}, ${addr.barangay || ''}, ${addr.city || ''}, ${addr.province || ''}, ${addr.region || ''} ${addr.postal_code || ''}`}
                    </div>
                </div>
            </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
