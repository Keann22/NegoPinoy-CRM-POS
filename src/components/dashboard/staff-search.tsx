import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

type StaffUser = { id: string; fullName: string; email: string; roles: string[]; };

export function StaffSearch({ selected, onChange }: { selected: string[]; onChange: (names: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const currentFullName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '';

    const loadStaff = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_all_users');
        if (error) throw error;

        const parsed: StaffUser[] = (data || [])
          .map((u: any) => {
            const meta = u.raw_user_meta_data || {};
            const fullName = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || u.email;
            const roles = Array.isArray(meta.roles) ? meta.roles : (meta.role ? [meta.role] : []);
            return { id: u.id, fullName, email: u.email || '', roles };
          })
          .filter((u: StaffUser) => u.fullName && u.fullName.toLowerCase() !== currentFullName.toLowerCase());

        setStaff(parsed);
      } catch (err) {
        console.error('Error loading staff list:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStaff();
  }, [supabase, userProfile]);

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter(n => n !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(name => (
            <Badge key={name} variant="secondary" className="flex items-center gap-1 pr-1">
              {name}
              <button type="button" onClick={() => toggle(name)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start font-normal text-left">
            {selected.length > 0 ? `${selected.length} staff tagged` : 'Tag staff...'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search staff by name..." />
            <CommandList>
              {isLoading && <CommandItem disabled>Loading staff...</CommandItem>}
              {!isLoading && staff.length === 0 && <CommandEmpty>No staff found.</CommandEmpty>}
              <CommandGroup>
                {staff.map((s) => {
                  const isSelected = selected.includes(s.fullName);
                  return (
                    <CommandItem
                      key={s.id}
                      value={s.fullName}
                      onSelect={() => toggle(s.fullName)}
                    >
                      <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                      <div className="flex flex-col">
                        <span>{s.fullName}</span>
                        {s.roles.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">{s.roles.join(', ')}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
