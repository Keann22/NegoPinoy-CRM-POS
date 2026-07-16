import { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { cn } from '@/lib/utils';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  mentions: string[];
  onMentionsChange: (names: string[]) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Finds the "@partial" token ending at the caret, if any, so we know whether to show suggestions. */
function findMentionQuery(value: string, caret: number): { start: number; query: string } | null {
  const upToCaret = value.slice(0, caret);
  const match = upToCaret.match(/(?:^|\s)@(\S*)$/);
  if (!match) return null;
  const start = upToCaret.length - match[0].length + (match[0].startsWith('@') ? 0 : 1);
  return { start, query: match[1] };
}

export function MentionInput({
  value,
  onChange,
  mentions,
  onMentionsChange,
  onSubmit,
  placeholder,
  disabled,
  className,
}: MentionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { staff } = useStaffDirectory();

  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const suggestions = useMemo(() => {
    if (!query) return [];
    const q = query.query.toLowerCase();
    return staff.filter((s) => s.fullName.toLowerCase().includes(q)).slice(0, 6);
  }, [query, staff]);

  const isOpen = query !== null && suggestions.length > 0;

  const updateQueryFromCaret = (nextValue: string) => {
    const caret = inputRef.current?.selectionStart ?? nextValue.length;
    setQuery(findMentionQuery(nextValue, caret));
    setHighlighted(0);
  };

  const selectSuggestion = (fullName: string) => {
    if (!query) return;
    const caret = inputRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, query.start);
    const after = value.slice(caret);
    const nextValue = `${before}@${fullName} ${after}`;
    onChange(nextValue);
    if (!mentions.some((m) => m.toLowerCase() === fullName.toLowerCase())) {
      onMentionsChange([...mentions, fullName]);
    }
    setQuery(null);

    requestAnimationFrame(() => {
      const pos = before.length + fullName.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    });
  };

  return (
    <div className="relative flex-1">
      <Input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          updateQueryFromCaret(e.target.value);
        }}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            updateQueryFromCaret(value);
          }
        }}
        onKeyDown={(e) => {
          if (isOpen) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlighted((h) => (h + 1) % suggestions.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlighted((h) => (h - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              selectSuggestion(suggestions[highlighted].fullName);
              return;
            }
            if (e.key === 'Escape') {
              setQuery(null);
              return;
            }
          }
          if (e.key === 'Enter') {
            onSubmit?.();
          }
        }}
        onBlur={() => {
          setTimeout(() => setQuery(null), 150);
        }}
      />
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md z-50">
          {suggestions.map((s, idx) => (
            <button
              type="button"
              key={s.id}
              className={cn(
                'w-full text-left px-3 py-1.5 text-sm flex flex-col',
                idx === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(s.fullName)}
            >
              <span>{s.fullName}</span>
              {s.roles.length > 0 && (
                <span className="text-[10px] text-muted-foreground">{s.roles.join(', ')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
