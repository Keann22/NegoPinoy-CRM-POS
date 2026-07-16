import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export function StaffSearch({ selected, onChange }: { selected: string[]; onChange: (names: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const { staff, isLoading } = useStaffDirectory();

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
      <Popover open={open} onOpenChange={setOpen} modal={true}>
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
