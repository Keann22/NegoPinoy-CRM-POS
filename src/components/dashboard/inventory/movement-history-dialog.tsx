'use client';
import React from 'react';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

type AuditLog = {
  id: string;
  table_name: string;
  record_id: string;
  user_email: string;
  action: string;
  old_values: any;
  new_values: any;
  created_at: string;
};

interface MovementHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movementId: string | null;
}

export function MovementHistoryDialog({ open, onOpenChange, movementId }: MovementHistoryDialogProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = useSupabase();

  useEffect(() => {
    if (open && movementId) {
      const fetchLogs = async () => {
        setIsLoading(true);
        try {
          const { data, error } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('table_name', 'inventory_movements')
            .eq('record_id', movementId)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          setLogs(data || []);
        } catch (error) {
          console.error("Failed to fetch audit logs", error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchLogs();
    } else {
      setLogs([]);
    }
  }, [open, movementId, supabase]);

  const renderChanges = (oldData: any, newData: any) => {
    if (!oldData || !newData) return <span>Initial Creation</span>;
    
    const changes: React.ReactElement[] = [];
    Object.keys(newData).forEach(key => {
      if (oldData[key] !== newData[key]) {
        changes.push(
          <div key={key} className="text-sm">
            <span className="font-semibold capitalize">{key.replace('_', ' ')}:</span>{' '}
            <span className="line-through text-muted-foreground mr-1">{oldData[key] ?? 'none'}</span>
            <span className="text-green-600 font-medium">➔ {newData[key] ?? 'none'}</span>
          </div>
        );
      }
    });

    if (changes.length === 0) return <span className="text-muted-foreground italic">No changes detected.</span>;
    return <div className="space-y-1">{changes}</div>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit History (Audit Trail)</DialogTitle>
          <DialogDescription>
            Paper trail of all changes made to this inventory transaction.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 w-full border rounded-md mt-4">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0">
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Changes Made</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : logs.length > 0 ? (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap align-top pt-4">
                      {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      {log.user_email}
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      {renderChanges(log.old_values, log.new_values)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No edits have been made to this transaction.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
