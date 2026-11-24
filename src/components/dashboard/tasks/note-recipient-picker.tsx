'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNoteTargets } from '@/hooks/useStaffTasks';

export interface NoteRecipients {
  targetKeys: string[];
  needsAnswer: boolean;
}

export const NO_RECIPIENTS: NoteRecipients = { targetKeys: [], needsAnswer: true };

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'border-blue-600 bg-blue-600 text-white' : 'bg-background hover:bg-muted'
      )}
    >
      {active && <Check className="h-3 w-3" />}
      {children}
    </button>
  );
}

/**
 * "Para kanino?" under an order note (owner, 2026-11-25): send it to Inventory,
 * the Owners, the order's sales agent or anyone else, so they get a pop-up.
 * "Note lang" (the default) tells nobody. Then "Kailangan ng sagot" (stays until
 * they answer) or "Pasabi lang po" (closes when they tap Nakita ko).
 */
export function NoteRecipientPicker({ orderId, value, onChange, disabled }: {
  orderId: string | null;
  value: NoteRecipients;
  onChange: (next: NoteRecipients) => void;
  disabled?: boolean;
}) {
  const targets = useNoteTargets(orderId);
  const quick = targets.filter((t) => t.kind !== 'person');
  const others = targets.filter((t) => t.kind === 'person');
  const picked = new Set(value.targetKeys);
  const toggle = (key: string) => {
    const next = picked.has(key) ? value.targetKeys.filter((k) => k !== key) : [...value.targetKeys, key];
    onChange({ ...value, targetKeys: next });
  };
  const pickedOthers = others.filter((t) => picked.has(t.key));
  const pickedTeams = quick.filter((t) => t.kind === 'team' && picked.has(t.key));

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-muted-foreground">Para kanino?</span>
        <Chip active={picked.size === 0} onClick={() => onChange({ ...value, targetKeys: [] })} title="Saved on the order only; nobody gets a pop-up">
          Note lang
        </Chip>
        {quick.map((t) => (
          <Chip key={t.key} active={picked.has(t.key)} onClick={() => toggle(t.key)} title={t.detail}>
            {t.label}{t.kind === 'agent' && <span className="opacity-75">(agent)</span>}
          </Chip>
        ))}
        {pickedOthers.map((t) => (
          <span key={t.key} className="inline-flex items-center gap-1 rounded-full border border-blue-600 bg-blue-600 px-2.5 py-1 text-xs font-medium text-white">
            {t.label}
            <button type="button" aria-label={`Remove ${t.label}`} onClick={() => toggle(t.key)}><X className="h-3 w-3" /></button>
          </span>
        ))}
        {others.length > 0 && (
          <select
            aria-label="Ibang tao"
            className="h-7 rounded-full border bg-background px-2 text-xs"
            value=""
            onChange={(e) => { if (e.target.value) toggle(e.target.value); }}
          >
            <option value="">Iba pa…</option>
            {others.filter((t) => !picked.has(t.key)).map((t) => (
              <option key={t.key} value={t.key}>{t.label}{t.detail ? ` (${t.detail})` : ''}</option>
            ))}
          </select>
        )}
      </div>

      {picked.size > 0 && (
        <div className="space-y-1.5 rounded-md bg-blue-50/70 p-2 dark:bg-blue-950/30">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={value.needsAnswer} onClick={() => onChange({ ...value, needsAnswer: true })}>Kailangan ng sagot</Chip>
            <Chip active={!value.needsAnswer} onClick={() => onChange({ ...value, needsAnswer: false })}>Pasabi lang po</Chip>
          </div>
          <p className="text-xs text-muted-foreground">
            {value.needsAnswer
              ? 'Mag-pop-up sa kanila hanggang sumagot sila o mag-Tapos na. Ang sagot ay mag-pop-up sa iyo.'
              : 'Mag-pop-up sa kanila hanggang i-tap nila ang Nakita ko.'}
            {pickedTeams.map((t) => ` ${t.label}: ${t.detail}. Kung sino ang unang sumagot, sarado na para sa lahat.`).join('')}
            {' '}Kung walang nakakita sa loob ng 2 oras, sasabihan ka at makikita ng owners.
          </p>
        </div>
      )}
    </fieldset>
  );
}
