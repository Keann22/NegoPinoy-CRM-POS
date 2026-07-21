'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function StaffMessageFab() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!userProfile?.id) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();
    try {
      const res = await fetch(
        `/api/messages/unread?userId=${encodeURIComponent(userProfile.id)}&userName=${encodeURIComponent(fullName)}`
      );
      if (!res.ok) throw new Error('Failed to fetch unread count');
      const body = await res.json();
      setUnreadCount(body.totalUnread || 0);
    } catch (err) {
      console.error('Error fetching thread unread count:', err);
    }
  }, [userProfile?.id, userProfile?.firstName, userProfile?.lastName]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount, pathname]);

  useEffect(() => {
    if (!supabase || !userProfile?.id) return;

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
          table: 'order_issue_messages',
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userProfile?.id, fetchUnreadCount]);

  // The messages page is the destination — no floating shortcut needed on it
  if (pathname === '/dashboard/messages') return null;

  return (
    <Button
      onClick={() => router.push('/dashboard/messages')}
      size="icon"
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
    >
      <MessageCircle className="h-6 w-6" />
      {unreadCount > 0 && (
        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-red-500 hover:bg-red-600">
          {unreadCount > 9 ? '9+' : unreadCount}
        </Badge>
      )}
      <span className="sr-only">Open messages</span>
    </Button>
  );
}
