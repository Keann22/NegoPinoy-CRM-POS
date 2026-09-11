'use client';

import { Target, CheckCircle2, Award, ListFilter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { GuardianDailyProgress } from '@/types';

interface InventoryGuardianDailyGoalCardProps {
  dailyProgress: GuardianDailyProgress;
  showAllBacklog: boolean;
  onToggleShowAllBacklog: (show: boolean) => void;
  onClose: () => void;
}

export function InventoryGuardianDailyGoalCard({
  dailyProgress,
  showAllBacklog,
  onToggleShowAllBacklog,
  onClose
}: InventoryGuardianDailyGoalCardProps) {
  const percent = Math.min(100, Math.round((dailyProgress.completedToday / dailyProgress.target) * 100));

  return (
    <div className="p-3 rounded-lg border bg-primary/5 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Target className="h-4 w-4 text-primary" />
          <span>
            Today's Goal: {dailyProgress.completedToday} of {dailyProgress.target} products verified
          </span>
        </div>
        {dailyProgress.isGoalMet ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px] gap-1">
            <CheckCircle2 className="h-3 w-3" /> Goal Complete
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
            {dailyProgress.remainingToday} item(s) left today
          </Badge>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted/70 rounded-full h-2 overflow-hidden border">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            dailyProgress.isGoalMet ? 'bg-emerald-600' : 'bg-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Staff Activity / Items Verified Today */}
      {dailyProgress.completedItems.length > 0 && (
        <div className="pt-1 border-t border-primary/10">
          <p className="text-[11px] font-medium text-foreground pb-1">Verified today by staff:</p>
          <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
            {dailyProgress.completedItems.map((item) => (
              <span
                key={item.id}
                className="bg-background px-2 py-0.5 rounded border text-[10px] flex items-center gap-1 text-muted-foreground"
              >
                <span className="font-semibold text-foreground truncate max-w-[120px]">{item.productName}</span>
                <span className="text-primary font-medium">({item.actorName})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mode Switcher: Today's Queue vs Full Backlog */}
      <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground border-t border-primary/10">
        <span>
          {showAllBacklog ? 'Viewing full backlog mode' : `Focusing on today's 5-product queue`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onToggleShowAllBacklog(!showAllBacklog)}
          className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/10"
        >
          {showAllBacklog ? (
            <>
              <RotateCcw className="h-3 w-3" /> Back to Today's Queue
            </>
          ) : (
            <>
              <ListFilter className="h-3 w-3" /> View All Backlog ({dailyProgress.totalBacklogCount})
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface GoalCompletedModalViewProps {
  dailyProgress: GuardianDailyProgress;
  onViewAllBacklog: () => void;
  onClose: () => void;
}

export function GoalCompletedModalView({
  dailyProgress,
  onViewAllBacklog,
  onClose
}: GoalCompletedModalViewProps) {
  return (
    <div className="py-6 px-4 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600">
        <Award className="h-6 w-6" />
      </div>

      <div className="space-y-1">
        <h3 className="text-lg font-bold text-foreground">Today's Verification Goal Complete! 🎉</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Staff has successfully verified <strong>{dailyProgress.completedToday} products</strong> today.
          The remaining backlog ({dailyProgress.totalBacklogCount} items) is safely queued for upcoming days.
        </p>
      </div>

      {dailyProgress.completedItems.length > 0 && (
        <div className="bg-muted/30 p-3 rounded-lg border max-w-md mx-auto text-left text-xs space-y-1.5">
          <p className="font-semibold text-[11px] text-foreground">Verified today:</p>
          <div className="space-y-1">
            {dailyProgress.completedItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-[11px]">
                <span className="truncate max-w-[220px] text-muted-foreground">{item.productName}</span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {item.actorName}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 pt-2">
        <Button size="sm" onClick={onClose} className="text-xs h-8">
          Done for Today
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onViewAllBacklog}
          className="text-xs h-8 gap-1"
        >
          <ListFilter className="h-3.5 w-3.5" />
          Review Remaining Backlog ({dailyProgress.totalBacklogCount})
        </Button>
      </div>
    </div>
  );
}
