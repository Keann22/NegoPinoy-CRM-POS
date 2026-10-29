'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Shown instead of Next's blank "Application error" screen when a dashboard page
// crashes. The message is shown so staff can screenshot it for debugging.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard crashed:', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h2 className="text-lg font-semibold">Something went wrong on this page</h2>
      <p className="text-sm text-muted-foreground">
        Please take a screenshot of this and send it to the admin, then tap Try again.
      </p>
      <pre className="w-full whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-left text-xs">
        {error?.message || String(error)}
        {error?.digest ? `\n(ref: ${error.digest})` : ''}
      </pre>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    </div>
  );
}
