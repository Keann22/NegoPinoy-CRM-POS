'use client';

import React, { useState, useEffect } from 'react';
import { Check, Pencil, CheckCircle2, AlertCircle } from 'lucide-react';
import { PERSONA_META, type PersonaType, type StaffProfileVerdict } from '@/types';

interface CustomerPersonaFeedbackBarProps {
  currentPersonaType: PersonaType;
  staffVerdict: StaffProfileVerdict | null;
  staffCorrectionNote: string | null;
  staffVerifiedBy: string | null;
  busy: boolean;
  onSubmitFeedback: (input: {
    verdict: StaffProfileVerdict;
    personaType?: PersonaType;
    correctionNote?: string | null;
  }) => Promise<boolean>;
}

const PERSONA_OPTIONS = Object.entries(PERSONA_META) as [
  PersonaType,
  (typeof PERSONA_META)[PersonaType],
][];

export function CustomerPersonaFeedbackBar({
  currentPersonaType,
  staffVerdict,
  staffCorrectionNote,
  staffVerifiedBy,
  busy,
  onSubmitFeedback,
}: CustomerPersonaFeedbackBarProps) {
  const [editing, setEditing] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<PersonaType>(currentPersonaType);
  const [note, setNote] = useState(staffCorrectionNote || '');

  useEffect(() => {
    setSelectedPersona(currentPersonaType);
    setNote(staffCorrectionNote || '');
  }, [currentPersonaType, staffCorrectionNote]);

  const handleAccurate = async () => {
    await onSubmitFeedback({ verdict: 'accurate', correctionNote: staffCorrectionNote });
    setEditing(false);
  };

  const handleSaveFix = async () => {
    const ok = await onSubmitFeedback({
      verdict: 'needs_fix',
      personaType: selectedPersona,
      correctionNote: note.trim() || null,
    });
    if (ok) setEditing(false);
  };

  return (
    <div className="pt-2.5 border-t border-border/60 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          {staffVerdict === 'accurate' ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                Verified accurate{staffVerifiedBy ? ` by ${staffVerifiedBy}` : ''}
              </span>
            </>
          ) : staffVerdict === 'needs_fix' ? (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                Corrected{staffVerifiedBy ? ` by ${staffVerifiedBy}` : ''}
                {staffCorrectionNote ? `: "${staffCorrectionNote}"` : ''}
              </span>
            </>
          ) : (
            <span>Is this persona accurate?</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={handleAccurate}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all disabled:opacity-50 ${
              staffVerdict === 'accurate'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-background hover:bg-emerald-500/10 text-foreground border-border'
            }`}
          >
            <Check className="w-3 h-3" />
            <span>Correct</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-background hover:bg-muted text-foreground border-border transition-all disabled:opacity-50"
          >
            <Pencil className="w-3 h-3" />
            <span>Correct</span>
          </button>
        </div>
      </div>

      {editing && (
        <div className="bg-muted/40 border border-border rounded-xl p-2.5 space-y-2">
          <div className="text-[11px] font-semibold text-foreground">
            Correct Persona & Note (AI learns on next refresh)
          </div>
          <select
            value={selectedPersona}
            onChange={(e) => setSelectedPersona(e.target.value as PersonaType)}
            className="w-full text-xs bg-background border border-input rounded-lg px-2 py-1.5 text-foreground"
          >
            {PERSONA_OPTIONS.map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label} — {meta.description}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did the AI miss? (e.g. Actually a home baker, prefers bus shipping)"
            className="w-full text-xs bg-background border border-input rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/60"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSaveFix}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save Correction'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
