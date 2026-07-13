'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageCircle } from 'lucide-react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageStaffDialog } from '@/components/dashboard/message-staff-dialog';

export function StaffMessageFab() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!supabase || !userProfile?.firstName) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('sales_person_name', fullName)
      .eq('source', 'staff_message')
      .eq('is_read', false);

    if (error) {
      console.error('Error fetching staff message unread count:', error);
      return;
    }

    setUnreadCount(count || 0);
  }, [supabase, userProfile]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!supabase || !userProfile?.firstName) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();

    // Guard against a duplicate subscription on the same topic (e.g. React Strict
    // Mode's double-invoke in dev), which throws when .on() is called on a channel
    // that's already past .subscribe().
    supabase.getChannels()
      .filter(c => c.topic === 'realtime:staff-message-fab-channel')
      .forEach(c => supabase.removeChannel(c));

    const channel = supabase
      .channel('staff-message-fab-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `sales_person_name=eq.${fullName}`,
        },
        (payload) => {
          if (payload.new.source === 'staff_message') {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userProfile?.id, userProfile?.firstName, userProfile?.lastName]);

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-red-500 hover:bg-red-600">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
        <span className="sr-only">Message Staff</span>
      </Button>

      <MessageStaffDialog
        open={isDialogOpen}
        onOpenChange={(next) => {
          setIsDialogOpen(next);
          if (!next) fetchUnreadCount();
        }}
      />
    </>
  );
}
