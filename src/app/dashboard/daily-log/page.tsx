'use client';

import { useState, useRef } from 'react';
import { format } from 'date-fns';
import {
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ClipboardList,
  ImageIcon,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentDailyLogs } from '@/hooks/useAgentDailyLogs';
import { TASK_TYPE_LABELS } from '@/types';
import type { TaskType, LogStatus } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<LogStatus, { label: string; icon: React.ElementType; class: string }> = {
  pending: { label: 'Pending AI Review', icon: Clock, class: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  approved: { label: 'Approved', icon: CheckCircle2, class: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'Rejected', icon: XCircle, class: 'bg-red-100 text-red-800 border-red-200' },
  flagged: { label: 'Flagged', icon: AlertTriangle, class: 'bg-orange-100 text-orange-800 border-orange-200' },
};

export default function DailyLogPage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [taskType, setTaskType] = useState<TaskType>('delete_inactive');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    success: boolean;
    verdict?: string;
    feedback?: string;
    error?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { logs, isLoading, submitLog } = useAgentDailyLogs();

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setSubmissionResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    setIsSubmitting(true);
    setSubmissionResult(null);

    const result = await submitLog({
      logDate: today,
      taskType,
      notes,
      imageFile: selectedFile,
    });

    setSubmissionResult(result);
    setIsSubmitting(false);

    if (result.success) {
      // Reset form on success
      setSelectedFile(null);
      setPreviewUrl(null);
      setNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold font-headline tracking-tight">Daily Task Log</h1>
          <p className="text-muted-foreground text-sm">
            Upload your proof of daily catalog maintenance task for {format(new Date(), 'MMMM d, yyyy')}.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Submission Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submit Today&apos;s Proof</CardTitle>
            <CardDescription>
              Upload a screenshot from Facebook/Meta Business Suite showing your completed task.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date</label>
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm">
                  {format(new Date(), 'MMMM d, yyyy')}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Task Type</label>
                <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(TASK_TYPE_LABELS) as [TaskType, string][]).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Screenshot Proof</label>
                <div
                  className={cn(
                    'relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors',
                    previewUrl ? 'border-primary/40 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50'
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="Proof preview" className="max-h-48 rounded object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ImageIcon className="h-10 w-10 opacity-40" />
                      <p className="text-sm">Click to upload a screenshot</p>
                      <p className="text-xs">PNG, JPG, WEBP accepted</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground truncate">
                    Selected: {selectedFile.name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notes (Optional)</label>
                <Textarea
                  placeholder="Add any additional notes about your task..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              {submissionResult && (
                <div
                  className={cn(
                    'rounded-lg border p-4 text-sm',
                    submissionResult.success
                      ? submissionResult.verdict === 'approved'
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : submissionResult.verdict === 'rejected'
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : 'border-orange-200 bg-orange-50 text-orange-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  )}
                >
                  {submissionResult.success ? (
                    <>
                      <p className="font-semibold">
                        {submissionResult.verdict === 'approved'
                          ? '✅ Approved!'
                          : submissionResult.verdict === 'rejected'
                            ? '❌ Rejected'
                            : '⚠️ Flagged for Review'}
                      </p>
                      <p className="mt-1">{submissionResult.feedback}</p>
                    </>
                  ) : (
                    <p>{submissionResult.error}</p>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={!selectedFile || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Upload className="mr-2 h-4 w-4 animate-bounce" />
                    Uploading & Running AI Audit...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Daily Log
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Recent Submission History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Submissions</CardTitle>
            <CardDescription>Your last 60 days of daily log history.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                    <Skeleton className="h-10 w-10 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              {!isLoading && logs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <ClipboardList className="h-10 w-10 mb-3 opacity-30" />
                  <p className="font-medium">No submissions yet</p>
                  <p className="text-xs mt-1">Start submitting your daily proofs!</p>
                </div>
              )}
              {!isLoading &&
                logs.map((log) => {
                  const statusCfg = STATUS_CONFIG[log.status];
                  const StatusIcon = statusCfg.icon;
                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                    >
                      {log.proof_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={log.proof_image_url}
                          alt="proof"
                          className="h-12 w-12 rounded object-cover flex-shrink-0 border"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded border bg-muted flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {TASK_TYPE_LABELS[log.task_type]}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn('text-xs flex items-center gap-1 shrink-0', statusCfg.class)}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {statusCfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(log.log_date + 'T00:00:00'), 'MMM d, yyyy')}
                        </p>
                        {log.ai_feedback && (
                          <p className="text-xs text-muted-foreground mt-1 italic truncate">
                            AI: {log.ai_feedback}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
