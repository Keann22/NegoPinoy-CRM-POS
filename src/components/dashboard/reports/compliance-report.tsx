'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  getDaysInMonth,
  getDate,
  format,
  isSameMonth,
} from 'date-fns';
import {
  ShieldCheck,
  CalendarIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSupabase } from '@/lib/supabase/hooks';
import { getComplianceTier, TASK_TYPE_LABELS } from '@/types';
import type { AgentDailyLog, LogStatus } from '@/types';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

const STATUS_CONFIG: Record<LogStatus, { label: string; icon: React.ElementType; class: string }> = {
  pending: { label: 'Pending', icon: Clock, class: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  approved: { label: 'Approved', icon: CheckCircle2, class: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'Rejected', icon: XCircle, class: 'bg-red-100 text-red-800 border-red-200' },
  flagged: { label: 'Flagged', icon: AlertTriangle, class: 'bg-orange-100 text-orange-800 border-orange-200' },
};

const TIER_COLORS: Record<string, string> = {
  success: 'text-green-700 bg-green-50 border-green-200',
  warning: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  destructive: 'text-red-700 bg-red-50 border-red-200',
};

interface AgentSummary {
  userId: string;
  name: string;
  approvedDays: number;
  totalLogs: number;
  compliancePercent: number;
  logs: AgentDailyLog[];
}

export function ComplianceReport() {
  const supabase = useSupabase();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [allLogs, setAllLogs] = useState<AgentDailyLog[]>([]);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AgentDailyLog | null>(null);

  // Determine days in the selected period for compliance calculation
  const daysInPeriod = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return 1;
    const from = dateRange.from;
    const to = dateRange.to;
    // If it's a full current month, use days passed so far
    if (isSameMonth(from, new Date()) && isSameMonth(to, new Date())) {
      return getDate(new Date());
    }
    // Otherwise use total days in the month of the 'from' date
    return getDaysInMonth(from);
  }, [dateRange]);

  useEffect(() => {
    if (!supabase || !dateRange?.from || !dateRange?.to) return;
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        const fromStr = format(dateRange.from!, 'yyyy-MM-dd');
        const toStr = format(dateRange.to!, 'yyyy-MM-dd');

        const [logsRes, usersRes] = await Promise.all([
          supabase
            .from('agent_daily_logs')
            .select('*')
            .gte('log_date', fromStr)
            .lte('log_date', toStr)
            .order('log_date', { ascending: false }),
          supabase.rpc('get_all_users'),
        ]);

        const map = new Map<string, string>();
        if (usersRes.data) {
          usersRes.data.forEach((u: any) => {
            const meta = u.raw_user_meta_data || {};
            const name = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || u.email;
            map.set(u.id, name);
          });
        }
        setUserMap(map);
        setAllLogs((logsRes.data as AgentDailyLog[]) || []);
      } catch (err) {
        console.error('ComplianceReport fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, [supabase, dateRange]);

  const agentSummaries: AgentSummary[] = useMemo(() => {
    const grouped: Record<string, AgentDailyLog[]> = {};
    allLogs.forEach((log) => {
      if (!grouped[log.user_id]) grouped[log.user_id] = [];
      grouped[log.user_id].push(log);
    });

    return Object.entries(grouped).map(([userId, logs]) => {
      const approvedDays = logs.filter((l) => l.status === 'approved').length;
      const compliancePercent = daysInPeriod > 0 ? Math.round((approvedDays / daysInPeriod) * 100) : 0;
      return {
        userId,
        name: userMap.get(userId) || `User ${userId.substring(0, 6)}`,
        approvedDays,
        totalLogs: logs.length,
        compliancePercent,
        logs: logs.sort((a, b) => b.log_date.localeCompare(a.log_date)),
      };
    }).sort((a, b) => b.compliancePercent - a.compliancePercent);
  }, [allLogs, userMap, daysInPeriod]);

  const allAgentLogs = useMemo(() =>
    [...allLogs].sort((a, b) => b.log_date.localeCompare(a.log_date)),
    [allLogs]
  );

  return (
    <div className="space-y-6">
      {/* Header & Date Filter */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="font-headline text-blue-900">Agent Compliance Report</CardTitle>
          </div>
          <CardDescription>
            Tracks daily catalog maintenance task completion per agent. Compliance is calculated from AI-approved logs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Period:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('w-[260px] justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from
                    ? dateRange.to
                      ? `${format(dateRange.from, 'LLL dd, y')} – ${format(dateRange.to, 'LLL dd, y')}`
                      : format(dateRange.from, 'LLL dd, y')
                    : 'Pick a date range'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">
              ({daysInPeriod} days in period)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Agent Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance Summary by Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-center">Approved Days</TableHead>
                <TableHead className="text-center">Total Submissions</TableHead>
                <TableHead className="text-center">Compliance</TableHead>
                <TableHead className="text-center">Deduction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading && agentSummaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No log submissions found for this period.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                agentSummaries.map((agent) => {
                  const tier = getComplianceTier(agent.compliancePercent);
                  return (
                    <TableRow key={agent.userId}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell className="text-center">{agent.approvedDays} / {daysInPeriod}</TableCell>
                      <TableCell className="text-center">{agent.totalLogs}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={cn('font-bold', TIER_COLORS[tier.color])}>
                          {agent.compliancePercent}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={cn(TIER_COLORS[tier.color])}>
                          {tier.deductionPercent === 0
                            ? 'No Deduction'
                            : tier.deductionPercent === 100
                              ? '100% Forfeiture'
                              : `−${tier.deductionPercent}%`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* All Log Submissions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Submissions in Period</CardTitle>
          <CardDescription>Click on a row to view the uploaded proof image.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI Feedback</TableHead>
                <TableHead className="text-center">Proof</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading && allAgentLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No submissions found for this period.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                allAgentLogs.map((log) => {
                  const statusCfg = STATUS_CONFIG[log.status];
                  const StatusIcon = statusCfg.icon;
                  return (
                    <TableRow
                      key={log.id}
                      className={log.proof_image_url ? 'cursor-pointer hover:bg-muted/50' : ''}
                      onClick={() => log.proof_image_url && setSelectedLog(log)}
                    >
                      <TableCell className="text-sm font-medium">
                        {format(new Date(log.log_date + 'T00:00:00'), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>{userMap.get(log.user_id) || log.user_id.substring(0, 8)}</TableCell>
                      <TableCell className="text-sm">{TASK_TYPE_LABELS[log.task_type]}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs flex items-center gap-1 w-fit', statusCfg.class)}>
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.ai_feedback || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.proof_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={log.proof_image_url}
                            alt="proof thumbnail"
                            className="h-8 w-12 object-cover rounded border mx-auto"
                          />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Proof Image Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Proof — {selectedLog && TASK_TYPE_LABELS[selectedLog.task_type]}
              {selectedLog && ` · ${format(new Date(selectedLog.log_date + 'T00:00:00'), 'MMMM d, yyyy')}`}
            </DialogTitle>
          </DialogHeader>
          {selectedLog?.proof_image_url && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedLog.proof_image_url}
                alt="proof"
                className="w-full rounded-lg border object-contain max-h-[60vh]"
              />
              {selectedLog.ai_feedback && (
                <div className={cn('rounded-lg border px-3 py-2 text-sm', STATUS_CONFIG[selectedLog.status].class)}>
                  <strong>AI Feedback:</strong> {selectedLog.ai_feedback}
                </div>
              )}
              {selectedLog.notes && (
                <p className="text-sm text-muted-foreground">
                  <strong>Agent Notes:</strong> {selectedLog.notes}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
