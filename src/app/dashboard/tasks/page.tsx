'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { actOnTask, useMyTasks } from '@/hooks/useStaffTasks';
import { OwnerTasksList } from '@/components/dashboard/tasks/owner-tasks-list';
import { TaskItem } from '@/components/dashboard/tasks/task-item';
import { TaskDoneDialog } from '@/components/dashboard/tasks/task-done-dialog';
import type { StaffTask } from '@/types/staff-tasks.types';

/** Tasks: staff see theirs (open + done this week); owners also see every task they gave. */
export default function TasksPage() {
  return <Suspense><TasksContent /></Suspense>;
}

function TasksContent() {
  const params = useSearchParams();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const { tasks, open, loaded } = useMyTasks();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneTask, setDoneTask] = useState<StaffTask | null>(null);
  const isManagement = (userProfile?.roles || []).some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));
  const recentDone = tasks.filter((t) => t.status === 'done');

  const seen = async (t: StaffTask) => {
    setBusyId(t.id);
    try {
      await actOnTask(t.id, 'seen');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const mine = (
    <Card>
      <CardHeader>
        <CardTitle>Mga task ko</CardTitle>
        <CardDescription>From the owners. Tap <b>Tapos na</b> when it&apos;s done; they get notified.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loaded && open.length === 0 && <p className="text-sm text-muted-foreground">Walang task ngayon.</p>}
        {open.map((t) => (
          <TaskItem key={t.id} task={t} view="staff" busy={busyId === t.id} onSeen={seen} onDone={setDoneTask} />
        ))}
        {recentDone.length > 0 && (
          <>
            <p className="pt-2 text-sm font-medium text-muted-foreground">Done this week</p>
            {recentDone.map((t) => <TaskItem key={t.id} task={t} view="staff" />)}
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Tasks</h1>
      {isManagement && <OwnerTasksList highlightId={params.get('task')} />}
      {(!isManagement || tasks.length > 0) && mine}
      <TaskDoneDialog task={doneTask} onOpenChange={(o) => { if (!o) setDoneTask(null); }} />
    </div>
  );
}
