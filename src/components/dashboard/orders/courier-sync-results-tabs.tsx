import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { SyncResult } from '@/hooks/useCourierSync';

export function CourierSyncResultsTabs({ results }: { results: SyncResult[] }) {
  const successes = results.filter(r => r.category === 'success');
  const alreadyUpdated = results.filter(r => r.category === 'already_updated');
  const partialMatches = results.filter(r => r.category === 'partial_match');
  const notFound = results.filter(r => r.category === 'not_found');
  const errors = results.filter(r => r.category === 'error');

  return (
    <Tabs defaultValue={successes.length > 0 ? "success" : "already_updated"} className="w-full mt-4">
      <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto mb-6">
        <TabsTrigger value="success" className="py-2 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Successful ({successes.length})
        </TabsTrigger>
        <TabsTrigger value="already_updated" className="py-2">
          Already Updated ({alreadyUpdated.length})
        </TabsTrigger>
        <TabsTrigger value="partial_match" className="py-2 data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-700">
          <AlertCircle className="h-4 w-4 mr-2" />
          Partial Match ({partialMatches.length})
        </TabsTrigger>
        <TabsTrigger value="not_found" className="py-2 data-[state=active]:bg-destructive/20 data-[state=active]:text-destructive">
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
                <TableHead>Order ID</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Previous Status</TableHead>
                <TableHead>New Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {successes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No successful updates.
                  </TableCell>
                </TableRow>
              ) : (
                successes.map((res, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium font-mono">{res.orderId}</TableCell>
                    <TableCell>{res.trackingNumber}</TableCell>
                    <TableCell><Badge variant="secondary">{res.originalStatus}</Badge></TableCell>
                    <TableCell><Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{res.newStatus}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="already_updated">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Current Status</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alreadyUpdated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No already updated orders found.
                  </TableCell>
                </TableRow>
              ) : (
                alreadyUpdated.map((res, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium font-mono">{res.orderId}</TableCell>
                    <TableCell>{res.trackingNumber}</TableCell>
                    <TableCell><Badge variant="outline">{res.originalStatus}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{res.message}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
      
      <TabsContent value="partial_match">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Excel Order ID</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Match Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partialMatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No partial matches found.
                  </TableCell>
                </TableRow>
              ) : (
                partialMatches.map((res, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium font-mono text-muted-foreground">{res.orderId}</TableCell>
                    <TableCell>{res.trackingNumber}</TableCell>
                    <TableCell className="text-yellow-600 font-medium">{res.message}</TableCell>
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
                <TableHead>Order ID</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Error Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notFound.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No missing orders found. Great job!
                  </TableCell>
                </TableRow>
              ) : (
                notFound.map((res, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium font-mono">{res.orderId}</TableCell>
                    <TableCell>{res.trackingNumber}</TableCell>
                    <TableCell className="text-destructive">{res.message}</TableCell>
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
                <TableHead>Order ID</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Error Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No processing errors found.
                  </TableCell>
                </TableRow>
              ) : (
                errors.map((res, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium font-mono">{res.orderId}</TableCell>
                    <TableCell>{res.trackingNumber}</TableCell>
                    <TableCell className="text-destructive">{res.message}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
    </Tabs>
  );
}
