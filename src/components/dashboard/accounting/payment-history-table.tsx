import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PaymentTableRow } from './payment-table-row';

export function PaymentHistoryTable({
  isLoading,
  paginatedData,
  orderMap,
  handleStatusChange,
}: {
  isLoading: boolean;
  paginatedData: any[];
  orderMap: Map<string, { customerName: string; salesPersonName: string }>;
  handleStatusChange: (paymentId: string, newStatus: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Order</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Processor</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Ref No.</TableHead>
          <TableHead>Proof</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">OCR Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-8 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-6 w-20" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
          </TableRow>
        ))}
        {!isLoading && paginatedData.map((payment) => (
          <PaymentTableRow
            key={payment.id}
            payment={payment}
            orderInfo={orderMap.get(payment.order_id)}
            handleStatusChange={handleStatusChange}
          />
        ))}
      </TableBody>
    </Table>
  );
}
