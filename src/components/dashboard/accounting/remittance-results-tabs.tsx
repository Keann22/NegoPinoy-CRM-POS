import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RemittanceResult } from '@/hooks/useSPXRemittance';

export function RemittanceResultsTabs({ results }: { results: RemittanceResult[] }) {
  const [activeTab, setActiveTab] = useState('success');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const successes = results.filter(r => r.category === 'success') || [];
  const alreadyPaid = results.filter(r => r.category === 'already_paid') || [];
  const notFound = results.filter(r => r.category === 'not_found') || [];
  const errors = results.filter(r => r.category === 'error') || [];

  const getPaginated = (data: RemittanceResult[]) => data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const paginatedSuccesses = getPaginated(successes);
  const paginatedAlreadyPaid = getPaginated(alreadyPaid);
  const paginatedNotFound = getPaginated(notFound);
  const paginatedErrors = getPaginated(errors);

  const activeData = activeTab === 'success' ? successes : activeTab === 'already_paid' ? alreadyPaid : activeTab === 'not_found' ? notFound : errors;
  const totalPages = Math.max(1, Math.ceil(activeData.length / itemsPerPage));

  return (
    <>
      <Tabs 
        value={activeTab} 
        onValueChange={(val) => { setActiveTab(val); setCurrentPage(1); }} 
        className="w-full mt-4"
      >
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto mb-6">
          <TabsTrigger value="success" className="py-2 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700">
            <CheckCircle className="h-4 w-4 mr-2" />
            Processed ({successes.length})
          </TabsTrigger>
          <TabsTrigger value="already_paid" className="py-2">
            Already Paid ({alreadyPaid.length})
          </TabsTrigger>
          <TabsTrigger value="not_found" className="py-2 data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-700">
            <AlertCircle className="h-4 w-4 mr-2" />
            Not Found ({notFound.length})
          </TabsTrigger>
          <TabsTrigger value="errors" className="py-2 data-[state=active]:bg-destructive/20 data-[state=active]:text-destructive">
            Errors ({errors.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="success">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking No.</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead className="text-right">COD Collected</TableHead>
                  <TableHead className="text-right">Courier Fee</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSuccesses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No processed payments.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedSuccesses.map((res, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{res.trackingNumber}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{res.orderId}</TableCell>
                      <TableCell className="text-right text-emerald-600 font-medium">₱{res.codAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">₱{Math.abs(res.shippingFee).toLocaleString()}</TableCell>
                      <TableCell><Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Success</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="already_paid">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking No.</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead className="text-right">COD Collected</TableHead>
                  <TableHead className="text-right">Courier Fee</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAlreadyPaid.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No skipped payments found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedAlreadyPaid.map((res, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{res.trackingNumber}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{res.orderId}</TableCell>
                      <TableCell className="text-right font-medium">₱{res.codAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">₱{Math.abs(res.shippingFee).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{res.message}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="not_found">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking No.</TableHead>
                  <TableHead className="text-right">COD Collected</TableHead>
                  <TableHead className="text-right">Courier Fee</TableHead>
                  <TableHead>Error Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedNotFound.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      All tracking numbers matched! Great job!
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedNotFound.map((res, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{res.trackingNumber}</TableCell>
                      <TableCell className="text-right font-medium">₱{res.codAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">₱{Math.abs(res.shippingFee).toLocaleString()}</TableCell>
                      <TableCell className="text-yellow-600 font-medium">{res.message}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="errors">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking No.</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Error Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedErrors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      No database errors encountered.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedErrors.map((res, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{res.trackingNumber}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{res.orderId}</TableCell>
                      <TableCell className="text-destructive font-medium">{res.message}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex flex-col sm:flex-row items-center justify-between border-t p-6 mt-4 gap-4">
        <div className="text-sm text-muted-foreground">
          {(() => {
            const startIndex = activeData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
            const endIndex = Math.min(currentPage * itemsPerPage, activeData.length);
            return `Showing ${startIndex}-${endIndex} of ${activeData.length} records`;
          })()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            Previous
          </Button>
          <div className="text-sm font-medium mx-2">
            Page {currentPage} of {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentPage(p => Math.min(totalPages, p + 1));
            }}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
