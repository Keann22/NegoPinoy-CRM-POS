'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isManagement, isInventory, isLoading } = useRoleCheck();
  const canAccessInventory = isManagement || isInventory;

  useEffect(() => {
    if (!isLoading && !canAccessInventory) {
      router.replace('/dashboard');
    }
  }, [isLoading, canAccessInventory, router]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canAccessInventory) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold font-headline">Access Restricted</h2>
        <p className="text-muted-foreground max-w-md">
          Inventory and stock management is only accessible to Inventory and Management personnel.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
