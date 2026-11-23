'use client';

import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserProfile } from '@/hooks/useUserProfile';
import { cn } from '@/lib/utils';
import { AssignTaskDialog, type TaskOrderRef } from './assign-task-dialog';

/** "Assign task" for an order (order page, Priority List). Owners only; renders nothing for staff. */
export function AssignTaskButton({ order, className, onCreated }: { order: TaskOrderRef; className?: string; onCreated?: () => void }) {
  const { userProfile } = useUserProfile();
  const [open, setOpen] = useState(false);
  const isManagement = (userProfile?.roles || []).some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));
  if (!isManagement) return null;
  return (
    <>
      <Button variant="outline" size="sm" className={cn(className)} onClick={() => setOpen(true)}>
        <ClipboardCheck className="mr-1.5 h-4 w-4" />Assign task
      </Button>
      <AssignTaskDialog open={open} onOpenChange={setOpen} order={order} onCreated={onCreated} />
    </>
  );
}
