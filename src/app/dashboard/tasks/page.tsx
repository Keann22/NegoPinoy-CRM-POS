'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useMyTasks } from '@/hooks/useStaffTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { OwnerTasksList } from '@/components/dashboard/tasks/owner-tasks-list';
import { TaskItem } from '@/components/dashboard/tasks/task-item';

/** Tasks: staff see theirs (open + done this week); owners also see every task they gave. */
export default function TasksPage() {
  return <Suspense><TasksContent /></Suspense>;
}

function TasksContent() {
  const params = useSearchParams();
  const { userProfile } = useUserProfile();
  const { tasks, open, loaded } = useMyTasks();
  const { busyId, handlers, dialogs } = useTaskActions();
  const isManagement = (userProfile?.roles || []).some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));
  const recentDone = tasks.filter((t) => t.status === 'done');

  const mine = (
    <Card>
      <CardHeader>
        <CardTitle>Mga task ko</CardTitle>
        <CardDescription>
          From the owners. Tap <b>Ginagawa na</b> when you start, <b>May problema</b> if you can&apos;t do it, and <b>Tapos na</b> when it&apos;s done.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loaded && open.length === 0 && <p className="text-sm text-muted-foreground">Walang task ngayon.</p>}
        {open.map((t) => (
          <TaskItem key={t.id} task={t} view="staff" busy={busyId === t.id} {...handlers} />
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
      {dialogs}
    </div>
  );
}
