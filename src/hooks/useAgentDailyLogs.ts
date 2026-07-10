'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUser } from '@/lib/supabase/hooks';
import type { AgentDailyLog, TaskType } from '@/types';

/**
 * useAgentDailyLogs
 *
 * Fetches and manages agent daily log entries.
 * Handles image upload, hash-based duplicate detection, and submission.
 */
export function useAgentDailyLogs(userId?: string) {
  const supabase = useSupabase();
  const { user } = useUser();
  const [logs, setLogs] = useState<AgentDailyLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetUserId = userId || user?.uid;

  const fetchLogs = useCallback(async () => {
    if (!supabase || !targetUserId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('agent_daily_logs')
        .select('*')
        .eq('user_id', targetUserId)
        .order('log_date', { ascending: false })
        .limit(60);

      if (fetchError) throw fetchError;
      setLogs((data as AgentDailyLog[]) || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs.');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, targetUserId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  /**
   * Computes a SHA-256 hash of an image file for duplicate detection.
   */
  async function computeImageHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Submits a new daily log entry.
   * Uploads the image to Supabase Storage, checks for duplicates,
   * inserts the log, then triggers the AI audit.
   */
  async function submitLog(params: {
    logDate: string;
    taskType: TaskType;
    notes: string;
    imageFile: File;
  }): Promise<{ success: boolean; error?: string; verdict?: string; feedback?: string }> {
    if (!supabase || !user?.uid) {
      return { success: false, error: 'Not authenticated.' };
    }

    try {
      // 1. Compute image hash for duplicate detection
      const hash = await computeImageHash(params.imageFile);

      // 2. Check if this exact image was uploaded before
      const { data: existingHash } = await supabase
        .from('agent_daily_logs')
        .select('id, log_date')
        .eq('image_hash', hash)
        .maybeSingle();

      if (existingHash) {
        return {
          success: false,
          error: `Duplicate screenshot detected! Ang larawang ito ay na-upload na noong ${existingHash.log_date}. Please upload a new, unique screenshot.`,
        };
      }

      // 3. Upload image to Supabase Storage
      const fileExt = params.imageFile.name.split('.').pop();
      const filePath = `${user.uid}/${params.logDate}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('agent-proofs')
        .upload(filePath, params.imageFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('agent-proofs')
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl || null;

      // 4. Insert the log record (status = 'pending', AI will update it)
      const { data: newLog, error: insertError } = await supabase
        .from('agent_daily_logs')
        .insert({
          user_id: user.uid,
          log_date: params.logDate,
          task_type: params.taskType,
          notes: params.notes || null,
          proof_image_url: publicUrl,
          image_hash: hash,
          status: 'pending',
          ai_feedback: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (!publicUrl) {
        return {
          success: false,
          error: 'Failed to get a public URL for the uploaded image. The log was saved but is still pending review.',
        };
      }

      // 5. Trigger AI audit asynchronously
      const auditRes = await fetch('/api/audit-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId: newLog.id,
          photoUrl: publicUrl,
          taskType: params.taskType,
        }),
      });

      const auditData = await auditRes.json();

      // 6. Refresh local logs
      await fetchLogs();

      if (!auditRes.ok) {
        return {
          success: false,
          error: auditData.error || 'AI audit failed. The log was saved but is still pending review.',
        };
      }

      return {
        success: true,
        verdict: auditData.verdict,
        feedback: auditData.feedback,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed.';
      return { success: false, error: msg };
    }
  }

  return {
    logs,
    isLoading,
    error,
    fetchLogs,
    submitLog,
  };
}
