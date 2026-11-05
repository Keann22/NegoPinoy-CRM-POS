'use client';

/**
 * Tap-to-fill suggestions under a text box. Used instead of <datalist>, which
 * shows differently (or not at all) on iPhone and Huawei browsers.
 */
export function SuggestionChips({ options, value, onPick, max = 8 }: {
  options: string[];
  value: string;
  onPick: (v: string) => void;
  max?: number;
}) {
  const typed = value.trim().toLowerCase();
  const shown = options
    .filter((o) => o.toLowerCase() !== typed && (!typed || o.toLowerCase().includes(typed)))
    .slice(0, max);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {shown.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className="rounded-full border bg-muted/50 px-3 py-1 text-xs hover:bg-muted"
        >
          {o}
        </button>
      ))}
    </div>
  );
}
