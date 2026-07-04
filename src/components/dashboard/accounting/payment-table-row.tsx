import { format, isValid } from 'date-fns';
import Link from 'next/link';
import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function PaymentTableRow({
  payment,
  orderInfo,
  handleStatusChange,
}: {
  payment: any;
  orderInfo: { customerName: string; salesPersonName: string } | undefined;
  handleStatusChange: (paymentId: string, newStatus: string) => void;
}) {
  const d = new Date(payment.payment_date);
  const isDateValid = isValid(d);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Verified':
        return 'default';
      case 'Rejected':
        return 'destructive';
      case 'Pending':
      default:
        return 'secondary';
    }
  };

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {isDateValid ? format(d, 'MMM d, yyyy h:mm a') : 'Unknown'}
      </TableCell>
      <TableCell>
        <Link href={`/dashboard/orders/${payment.order_id}`} className="font-semibold text-primary hover:underline">
          #{payment.order_id.substring(0, 7).toUpperCase()}
        </Link>
      </TableCell>
      <TableCell className="font-medium">
        {orderInfo?.customerName || 'Loading...'}
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {orderInfo?.salesPersonName || 'Unknown'}
      </TableCell>
      <TableCell>{payment.payment_method}</TableCell>
      <TableCell>{payment.reference_number || '-'}</TableCell>
      <TableCell>
        {payment.proof_url ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Eye className="h-4 w-4 mr-2" />
                View
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Payment Proof</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={payment.proof_url} 
                  alt="Payment Proof" 
                  className="max-h-[70vh] object-contain rounded-md" 
                />
              </div>
            </DialogContent>
          </Dialog>
        ) : '-'}
      </TableCell>
      <TableCell className="max-w-[200px] truncate" title={payment.notes}>
        {payment.notes || '-'}
      </TableCell>
      <TableCell className="text-right font-semibold">
        ₱{(Number(payment.amount) || 0).toFixed(2)}
      </TableCell>
      <TableCell className={`text-right font-semibold ${payment.ocr_amount && payment.ocr_amount !== payment.amount ? 'text-destructive' : ''}`}>
        {payment.ocr_amount ? `₱${(Number(payment.ocr_amount)).toFixed(2)}` : '-'}
      </TableCell>
      <TableCell>
        <Badge variant={getStatusVariant(payment.status || 'Pending')}>
          {payment.status || 'Pending'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup 
              value={payment.status || 'Pending'}
              onValueChange={(val) => handleStatusChange(payment.id, val)}
            >
              <DropdownMenuRadioItem value="Pending">Pending</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="Verified">Verified</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="Rejected">Rejected</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
