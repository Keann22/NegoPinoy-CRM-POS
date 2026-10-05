'use client';

import { useState } from 'react';
import { History, RefreshCw, Mail, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { CrmEmailLog } from '@/types/crm-email.types';

interface EmailHistoryTableProps {
  logs: CrmEmailLog[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
}

export function EmailHistoryTable({ logs, isLoading, onRefresh }: EmailHistoryTableProps) {
  const [selectedLog, setSelectedLog] = useState<CrmEmailLog | null>(null);

  const getStatusBadge = (status: CrmEmailLog['status']) => {
    switch (status) {
      case 'sent':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Sent
          </Badge>
        );
      case 'simulated':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-300">
            <Clock className="w-3 h-3 mr-1" />
            Simulated
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Email Dispatch History
          </CardTitle>
          <CardDescription className="text-xs">
            Review past CRM email broadcasts, delivery statuses, and contents.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRefresh()}
          disabled={isLoading}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[160px] text-xs">Date & Time</TableHead>
                <TableHead className="text-xs">Recipient</TableHead>
                <TableHead className="text-xs">Subject</TableHead>
                <TableHead className="w-[110px] text-xs">Status</TableHead>
                <TableHead className="w-[80px] text-right text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                    <Mail className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    No emails dispatched yet. Send your first CRM email above!
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="text-xs">
                    <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), 'MMM dd, yyyy h:mm a')}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{log.recipient_name || 'Customer'}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{log.recipient_email}</div>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate font-medium">
                      {log.subject}
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => setSelectedLog(log)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* View Detail Modal */}
        <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Email Dispatch Details</DialogTitle>
              <DialogDescription className="text-xs font-mono">
                {selectedLog?.recipient_email} • {selectedLog?.created_at && format(new Date(selectedLog.created_at), 'PPpp')}
              </DialogDescription>
            </DialogHeader>
            {selectedLog && (
              <div className="space-y-3 pt-2 text-xs">
                <div>
                  <span className="font-semibold text-muted-foreground">Subject:</span>
                  <p className="font-medium mt-0.5">{selectedLog.subject}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="font-semibold text-muted-foreground">Status:</span>
                    <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                  </div>
                  <div>
                    <span className="font-semibold text-muted-foreground">Mode:</span>
                    <div className="mt-1">
                      <Badge variant="outline" className="uppercase text-[10px] font-mono">
                        {selectedLog.mode || 'simulated'}
                      </Badge>
                    </div>
                  </div>
                </div>
                {selectedLog.error_message && (
                  <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700">
                    <span className="font-semibold">Error:</span> {selectedLog.error_message}
                  </div>
                )}
                <div>
                  <span className="font-semibold text-muted-foreground">Content:</span>
                  <div className="mt-1 p-3 bg-muted/30 rounded border whitespace-pre-line text-xs leading-relaxed max-h-60 overflow-y-auto">
                    {selectedLog.body}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
