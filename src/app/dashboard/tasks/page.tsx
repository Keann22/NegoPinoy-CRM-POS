'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useMyTasks } from '@/hooks/useStaffTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { OwnerTasksList } from '@/components/dashboard/tasks/owner-tasks-list';
import { OwnerTodoCard } from '@/components/dashboard/owner-todo/owner-todo-card';
import { ReadyToPickBanner } from '@/components/dashboard/tasks/ready-to-pick-banner';
import { TaskItem } from '@/components/dashboard/tasks/task-item';
import { SentNotesList } from '@/components/dashboard/tasks/sent-notes-list';
import { UnseenNotesList } from '@/components/dashboard/tasks/unseen-notes-list';

/**
 * Tasks: staff see theirs and the order notes sent to them (open + done this week),
 * and the notes they sent; owners also see every task they gave and notes nobody saw.
 */
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
        <CardTitle>For you</CardTitle>
        <CardDescription>
          Tasks from the owners: tap <b>Working on it</b> when you start, <b>Problem</b> if you can&apos;t do it, and <b>Done</b> when it&apos;s done.
          Notes on orders: tap <b>Answer</b>, or <b>Got it</b>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loaded && open.length === 0 && <p className="text-sm text-muted-foreground">No tasks right now.</p>}
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
      <ReadyToPickBanner />
      {isManagement && <OwnerTodoCard />}
      {isManagement && <UnseenNotesList />}
      {isManagement && <OwnerTasksList highlightId={params.get('task')} />}
      {(!isManagement || tasks.length > 0) && mine}
      <SentNotesList />
      {dialogs}
    </div>
  );
}
