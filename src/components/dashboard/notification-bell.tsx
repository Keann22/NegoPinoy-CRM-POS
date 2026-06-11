'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/firebase';
import { Bell, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

export function NotificationBell() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!supabase || !userProfile?.firstName) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('sales_person_name', fullName)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }

    setNotifications(data || []);
    setUnreadCount(data?.filter(n => !n.is_read).length || 0);
  }, [supabase, userProfile]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    // Request Desktop Notification Permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!supabase || !userProfile?.firstName) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();

    const channel = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `sales_person_name=eq.${fullName}`,
        },
        (payload) => {
          const newNotif = payload.new;
          
          setNotifications(prev => [newNotif, ...prev].slice(0, 20));
          setUnreadCount(prev => prev + 1);

          // Standard In-App Toast
          toast({
            title: newNotif.title,
            description: newNotif.message,
          });

          // Desktop System Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            const sysNotif = new Notification(newNotif.title, {
              body: newNotif.message,
              icon: '/icon.png', // Add your app icon path if you have one
            });
            
            sysNotif.onclick = () => {
              window.focus();
              sysNotif.close();
            };
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userProfile, toast]);

  const markAsRead = async (id: string) => {
    if (!supabase) return;
    
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));

    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!supabase || !userProfile?.firstName) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('sales_person_name', fullName)
      .eq('is_read', false);
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!supabase) return;

    const notif = notifications.find(n => n.id === id);
    if (notif && !notif.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setNotifications(prev => prev.filter(n => n.id !== id));
    
    await supabase.from('notifications').delete().eq('id', id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative ml-auto h-8 w-8 bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-red-500 hover:bg-red-600">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Toggle notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-auto px-2 py-1 text-xs">
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications yet.
          </div>
        ) : (
          notifications.map(notif => (
            <DropdownMenuItem key={notif.id} className="flex flex-col items-start gap-1 p-3 cursor-pointer relative group" onClick={() => markAsRead(notif.id)} asChild>
              <Link href={notif.link || '#'}>
                <div className="flex w-full justify-between items-start">
                  <span className={`font-semibold text-sm ${notif.is_read ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {notif.title}
                  </span>
                  {!notif.is_read && <span className="h-2 w-2 rounded-full bg-blue-500 mt-1 flex-shrink-0" />}
                </div>
                <span className={`text-xs ${notif.is_read ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                  {notif.message}
                </span>
                <span className="text-[10px] text-muted-foreground/50 mt-1">
                  {new Date(notif.created_at).toLocaleString()}
                </span>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={(e) => deleteNotification(e, notif.id)}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
