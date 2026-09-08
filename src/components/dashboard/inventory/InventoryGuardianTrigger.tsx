'use client';

import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useInventoryGuardian } from '@/hooks/useInventoryGuardian';
import { useRoleCheck } from '@/hooks/useRoleCheck';

export function InventoryGuardianTrigger() {
  const { isManagement, isInventory } = useRoleCheck();
  const { totalAnomaliesCount, openModal } = useInventoryGuardian();

  if (!isManagement && !isInventory) return null;

  const hasAnomalies = totalAnomaliesCount > 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full"
            onClick={openModal}
            aria-label="Inventory Guardian"
          >
            {hasAnomalies ? (
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-pulse" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-muted-foreground hover:text-foreground" />
            )}
            {hasAnomalies && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white">
                {totalAnomaliesCount > 9 ? '9+' : totalAnomaliesCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {hasAnomalies
            ? `Inventory Guardian: ${totalAnomaliesCount} stock issue(s) detected. Click to resolve.`
            : 'Inventory Guardian: Physical stocks healthy'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
