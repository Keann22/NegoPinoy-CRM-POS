'use client';

import { useMemo, useEffect, useState } from 'react';
import { getDaysInMonth, getDate, startOfMonth, format } from 'date-fns';
import { ShieldCheck, TrendingUp, AlertTriangle, XCircle, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUser } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getComplianceTier } from '@/types';
import type { AgentDailyLog } from '@/types';
import { cn } from '@/lib/utils';

/**
 * ComplianceWidget
 *
 * Displays the logged-in agent's compliance percentage for the current month
 * along with their deduction tier. Visible to Sales, Admin, and Owner roles.
 *
 * If Admin/Owner, shows a compact summary for ALL agents.
 */
export function ComplianceWidget() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();
  const isManagement = useMemo(
    () => userProfile?.roles?.some((r) => ['Owner', 'Admin'].includes(r)),
    [userProfile]
  );

  const [logs, setLogs] = useState<(AgentDailyLog & { agent_name?: string })[]>([]);
  const [agentSummaries, setAgentSummaries] = useState<
    { userId: string; name: string; compliance: number; approvedDays: number }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  const now = new Date();
  const totalDaysInMonth = getDaysInMonth(now);
  const daysPassed = getDate(now); // Days elapsed so far this month (including today)
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(now, 'yyyy-MM-dd');

  useEffect(() => {
    if (!supabase || !user?.uid) return;

    const fetchLogs = async () => {
      setIsLoading(true);
      try {
        if (isManagement) {
          // Fetch all logs for the current month for all agents
          const { data } = await supabase
            .from('agent_daily_logs')
            .select('*')
            .gte('log_date', monthStart)
            .lte('log_date', monthEnd)
            .in('status', ['approved']);

          const { data: usersData } = await supabase.rpc('get_all_users');
          const userMap = new Map<string, string>();
          if (usersData) {
            usersData.forEach((u: any) => {
              const meta = u.raw_user_meta_data || {};
              const name = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || u.email;
              userMap.set(u.id, name);
            });
          }

          // Group by user
          const grouped: Record<string, number> = {};
          (data || []).forEach((log: AgentDailyLog) => {
            grouped[log.user_id] = (grouped[log.user_id] || 0) + 1;
          });

          const summaries = Array.from(userMap.entries()).map(([userId, name]) => {
            const approvedDays = grouped[userId] || 0;
            const compliance = Math.round((approvedDays / daysPassed) * 100);
            return { userId, name, compliance, approvedDays };
          }).sort((a, b) => b.compliance - a.compliance);

          setAgentSummaries(summaries);
        } else {
          // Fetch only this agent's logs
          const { data } = await supabase
            .from('agent_daily_logs')
            .select('*')
            .eq('user_id', user.uid)
            .gte('log_date', monthStart)
            .lte('log_date', monthEnd)
            .in('status', ['approved']);

          setLogs((data as AgentDailyLog[]) || []);
        }
      } catch (err) {
        console.error('ComplianceWidget fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, [supabase, user, isManagement, monthStart, monthEnd, daysPassed]);

  // For personal agents: calculate their own compliance
  const approvedDays = logs.length;
  const compliancePercent = daysPassed > 0 ? Math.round((approvedDays / daysPassed) * 100) : 0;
  const tier = getComplianceTier(compliancePercent);

  const TIER_ICONS: Record<string, React.ElementType> = {
    success: CheckCircle2,
    warning: AlertTriangle,
    destructive: XCircle,
  };
  const TierIcon = TIER_ICONS[tier.color] ?? CheckCircle2;

  const TIER_COLORS: Record<string, string> = {
    success: 'text-green-700 bg-green-50 border-green-200',
    warning: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    destructive: 'text-red-700 bg-red-50 border-red-200',
  };

  if (isManagement) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="font-headline text-base">
              Agent Compliance — {format(now, 'MMMM yyyy')}
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Based on AI-approved daily logs. {daysPassed} of {totalDaysInMonth} days elapsed.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {agentSummaries.map((agent) => {
                const agentTier = getComplianceTier(agent.compliance);
                return (
                  <div
                    key={agent.userId}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="font-medium truncate">{agent.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground text-xs">
                        {agent.approvedDays}/{daysPassed} days
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs font-semibold',
                          TIER_COLORS[agentTier.color]
                        )}
                      >
                        {agent.compliance}%
                        {agentTier.deductionPercent > 0 && ` (−${agentTier.deductionPercent}%)`}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              {agentSummaries.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No approved logs yet this month.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Personal agent view
  return (
    <Card className={cn('border', TIER_COLORS[tier.color])}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            <CardTitle className="font-headline text-base">
              My Compliance — {format(now, 'MMMM yyyy')}
            </CardTitle>
          </div>
          <TrendingUp className="h-5 w-5 opacity-60" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Big percentage */}
            <div className="flex items-end gap-3">
              <span className="text-5xl font-bold font-headline tracking-tight">
                {compliancePercent}%
              </span>
              <div className="pb-1">
                <Badge
                  variant="outline"
                  className={cn('text-xs font-semibold', TIER_COLORS[tier.color])}
                >
                  <TierIcon className="h-3 w-3 mr-1" />
                  {tier.label}
                </Badge>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  tier.color === 'success' ? 'bg-green-500' :
                  tier.color === 'warning' ? 'bg-yellow-400' : 'bg-red-500'
                )}
                style={{ width: `${Math.min(compliancePercent, 100)}%` }}
              />
            </div>

            {/* Stats row */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <Clock className="h-3 w-3 inline mr-1" />
                {approvedDays} approved logs out of {daysPassed} days elapsed
              </span>
              <span>{totalDaysInMonth - daysPassed} days remaining</span>
            </div>

            {/* Tier description */}
            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium',
                TIER_COLORS[tier.color]
              )}
            >
              {tier.deductionPercent === 0 ? (
                <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 inline mr-1.5" />
              )}
              {tier.description}
            </div>

            {/* Tier guide */}
            <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
              <p className="font-medium mb-1">Compliance Tiers:</p>
              {[
                { range: '92%–100%', deduction: '0% (Full incentive)' },
                { range: '80%–91%', deduction: '−10%' },
                { range: '70%–79%', deduction: '−20%' },
                { range: '50%–69%', deduction: '−50%' },
                { range: 'Below 50%', deduction: '100% Forfeiture' },
              ].map((t) => (
                <div key={t.range} className="flex justify-between">
                  <span>{t.range}</span>
                  <span className="font-medium">{t.deduction}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
