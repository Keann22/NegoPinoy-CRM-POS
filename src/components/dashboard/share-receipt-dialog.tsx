'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Download, Image as ImageIcon } from "lucide-react";
import { useState, useRef } from "react";
import { type Order } from '@/app/dashboard/orders/page';
import * as htmlToImage from 'html-to-image';

interface ShareReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  customer: { firstName: string; lastName: string } | { fullName: string } | null;
  orderItems: any[];
}

export function ShareReceiptDialog({ open, onOpenChange, order, customer, orderItems }: ShareReceiptDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const handleDownloadImage = async () => {
    if (!receiptRef.current) return;
    
    setIsGenerating(true);
    try {
        const blob = await htmlToImage.toBlob(receiptRef.current, {
            backgroundColor: '#ffffff',
            pixelRatio: 2,
        });

        if (!blob) {
            console.error("Failed to create blob");
            setIsGenerating(false);
            return;
        }

        try {
            const item = new ClipboardItem({ "image/png": blob });
            await navigator.clipboard.write([item]);
            setIsGenerating(false);
        } catch (err) {
            console.error("Failed to copy image to clipboard", err);
            // Fallback to download if clipboard write fails
            const dataUrl = await htmlToImage.toPng(receiptRef.current, {
                backgroundColor: '#ffffff',
                pixelRatio: 2,
            });
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `Receipt_${order?.id.substring(0, 7).toUpperCase()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setIsGenerating(false);
        }
    } catch (err) {
        console.error('Failed to generate image: ', err);
        setIsGenerating(false);
    }
  };

  if (!order) return null;

  const receiptContent = (
    <>
        {/* Header */}
        <div className="text-center mb-6 border-b-2 border-dashed border-gray-300 pb-4">
            <div className="flex justify-center mb-2">
                <img src="/logo.png" alt="NegosyantengPinoy Logo" className="h-16 w-16 object-contain rounded-full" />
            </div>
            <h2 className="text-base font-bold uppercase mb-1">NegosyantengPinoy.Ph</h2>
            <p className="text-xs text-gray-500">Order Invoice</p>
        </div>

        {/* Details */}
        <div className="text-xs space-y-1 mb-6">
            <div className="flex justify-between">
                <span className="text-gray-500">Order No:</span>
                <span className="font-semibold">{order.id.substring(0, 7).toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
                <span className="text-gray-500">Date:</span>
                <span>{format(new Date(order.orderDate), 'MMM do, yyyy')}</span>
            </div>
            {customer && (
                <div className="flex justify-between">
                    <span className="text-gray-500">Customer:</span>
                    <span className="font-semibold text-right max-w-[150px] truncate">
                        {'fullName' in customer ? customer.fullName : `${customer.firstName} ${customer.lastName}`}
                    </span>
                </div>
            )}
        </div>

        {/* Items */}
        <div className="mb-6">
            <div className="text-xs font-bold border-b border-gray-200 pb-1 mb-2">ITEMS</div>
            {orderItems.map(item => (
                <div key={item.id} className="text-xs mb-3 pb-1">
                    <div className="font-medium truncate pb-1">{item.productName}</div>
                    <div className="flex justify-between text-gray-600">
                        {order.paymentType === 'Installment' ? (
                            <span>{item.quantity}x</span>
                        ) : (
                            <>
                                <span>{item.quantity} x ₱{item.sellingPriceAtSale.toFixed(2)}</span>
                                <span>₱{((item.sellingPriceAtSale - (item.discount || 0)) * item.quantity).toFixed(2)}</span>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>

        {/* Totals */}
        <div className="border-t-2 border-dashed border-gray-300 pt-4 text-xs space-y-2 mb-6">
            {order.paymentType !== 'Installment' && (
                <>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Subtotal</span>
                        <span>₱{order.subtotal.toFixed(2)}</span>
                    </div>
                    
                    {order.totalDiscount && order.totalDiscount > 0 ? (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Discount</span>
                            <span className="text-red-500">-₱{order.totalDiscount.toFixed(2)}</span>
                        </div>
                    ) : null}

                    {order.insurance_fee ? (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Insurance (1%)</span>
                            <span>+₱{order.insurance_fee.toFixed(2)}</span>
                        </div>
                    ) : null}
                </>
            )}

            <div className="flex justify-between font-bold text-sm pt-2 mt-2 border-t border-gray-200">
                <span>{order.paymentType === 'Installment' ? 'Installment Total' : 'Total'}</span>
                <span>₱{order.totalAmount.toFixed(2)}</span>
            </div>
        </div>

        {/* Payment Info */}
        <div className="bg-gray-50 p-3 rounded text-xs space-y-2 mb-6">
            <div className="flex justify-between">
                <span className="text-gray-500">Payment Type:</span>
                <span className="font-medium">{order.paymentType}</span>
            </div>
            {order.paymentType === 'Installment' && order.installmentMonths ? (
                <>
                        <div className="flex justify-between">
                        <span className="text-gray-500">Terms:</span>
                        <span>{order.installmentMonths} Months</span>
                    </div>
                    {order.monthlyPayment && (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Monthly:</span>
                            <span className="font-medium">₱{order.monthlyPayment.toFixed(2)}</span>
                        </div>
                    )}
                </>
            ) : null}
            <div className="flex justify-between pt-2 mt-2 border-t border-gray-200">
                <span className="text-gray-500">Amount Paid:</span>
                <span>₱{order.amountPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
                <span className="text-gray-500">Balance Due:</span>
                <span className="font-bold">₱{order.balanceDue.toFixed(2)}</span>
            </div>
        </div>

        <div className="text-center text-xs text-gray-400 mt-4">
            Thank you for your order!
        </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Share Receipt</DialogTitle>
          <DialogDescription>
            Download this receipt as an image to send to your customer.
          </DialogDescription>
        </DialogHeader>

        {/* Visible preview */}
        <div className="bg-muted p-4 rounded-md border overflow-y-auto max-h-[55vh] flex justify-center">
            <div 
                className="bg-white text-black p-6 rounded shadow-sm w-[340px] shrink-0"
                style={{ fontFamily: "monospace", lineHeight: '1.5' }}
            >
                {receiptContent}
            </div>
        </div>

        {/* Off-screen actual element for capturing the full height */}
        <div className="fixed -left-[9999px] top-0 overflow-visible">
            <div 
                ref={receiptRef} 
                className="bg-white text-black p-6 w-[340px]"
                style={{ fontFamily: "monospace", lineHeight: '1.5' }}
            >
                {receiptContent}
            </div>
        </div>
        
        <div className="flex justify-end pt-4">
            <Button className="w-full" onClick={handleDownloadImage} disabled={isGenerating}>
                {isGenerating ? 'Copying Image...' : (
                    <>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Copy Image to Clipboard
                    </>
                )}
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
