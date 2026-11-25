const MONTHS: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

const pad2 = (n: number) => String(n).padStart(2, '0');

function isValidIsoDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function toPhDateString(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function calendarDaysBetween(dateA: string, dateB: string): number {
  const a = Date.UTC(Number(dateA.slice(0, 4)), Number(dateA.slice(5, 7)) - 1, Number(dateA.slice(8, 10)));
  const b = Date.UTC(Number(dateB.slice(0, 4)), Number(dateB.slice(5, 7)) - 1, Number(dateB.slice(8, 10)));
  return Math.round((a - b) / 86400000);
}

export function normalizeTime24(raw: string): string | null {
  const m12 = raw.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)\b/i);
  if (m12) {
    let h = Number(m12[1]);
    const min = Number(m12[2]);
    const ap = m12[3].toUpperCase();
    if (h < 1 || h > 12 || min < 0 || min > 59) return null;
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${pad2(h)}:${pad2(min)}`;
  }
  const m24 = raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?\b/);
  if (m24) {
    return `${pad2(Number(m24[1]))}:${pad2(Number(m24[2]))}`;
  }
  return null;
}

export function timeToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesDiff(a: string, b: string): number {
  const ma = timeToMinutes(a);
  const mb = timeToMinutes(b);
  if (ma === null || mb === null) return 9999;
  return ma - mb;
}

interface DateCandidate {
  date: string;
  time: string | null;
  idx: number;
}

function findTimeNear(text: string, start: number, end: number): string | null {
  const snippet = text.slice(Math.max(0, start - 25), Math.min(text.length, end + 50));
  const t = normalizeTime24(snippet);
  if (t) return t;
  // Fallback: if the entire receipt has a clear single AM/PM timestamp, use it
  const all12 = Array.from(text.matchAll(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)\b/gi));
  if (all12.length === 1) return normalizeTime24(all12[0][0]);
  return null;
}

function collectDateCandidates(text: string, anchorDate: string | null): DateCandidate[] {
  const out: DateCandidate[] = [];
  const anchorYear = anchorDate ? Number(anchorDate.slice(0, 4)) : new Date().getUTCFullYear();
  const anchorMonth = anchorDate ? Number(anchorDate.slice(5, 7)) : new Date().getUTCMonth() + 1;

  const push = (y: number, m: number, d: number, idx: number, len: number) => {
    if (!isValidIsoDate(y, m, d)) return;
    const date = `${y}-${pad2(m)}-${pad2(d)}`;
    out.push({ date, time: findTimeNear(text, idx, idx + len), idx });
  };

  // 1. YYYY-MM-DD or YYYY/MM/DD
  for (const m of text.matchAll(/\b(202\d)[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]), m.index ?? 0, m[0].length);
  }
  // 2. MMM DD, YYYY (also "Sept 05, 2026")
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(202\d)\b/g)) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon) push(Number(m[3]), Number(mon), Number(m[2]), m.index ?? 0, m[0].length);
  }
  // 3. DD MMM YYYY
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(202\d)\b/g)) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) push(Number(m[3]), Number(mon), Number(m[1]), m.index ?? 0, m[0].length);
  }
  // 4. MM/DD/YYYY or DD/MM/YYYY (or with -)
  for (const m of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](202\d)\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (a > 12) push(y, b, a, m.index ?? 0, m[0].length);
    else if (b > 12) push(y, a, b, m.index ?? 0, m[0].length);
    else {
      push(y, a, b, m.index ?? 0, m[0].length);
      if (a !== b) push(y, b, a, m.index ?? 0, m[0].length);
    }
  }
  // 5. Year-less MMM DD or MMMDD (e.g. "Sep 05", "SEPT05") when no full-year match existed
  if (out.length === 0) {
    for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s*(\d{1,2})\b/g)) {
      const mon = MONTHS[m[1].toLowerCase()];
      if (!mon) continue;
      const monNum = Number(mon);
      const y = anchorMonth <= 2 && monNum >= 11 ? anchorYear - 1 : anchorYear;
      push(y, monNum, Number(m[2]), m.index ?? 0, m[0].length);
    }
  }
  return out;
}

export function extractReceiptDateTime(
  text: string,
  anchorIso?: string | null,
): { date: string | null; time: string | null } {
  if (!text) return { date: null, time: null };
  const anchorDate = toPhDateString(anchorIso);
  let candidates = collectDateCandidates(text, anchorDate);
  if (candidates.length === 0) return { date: null, time: null };

  if (anchorDate) {
    const plausible = candidates.filter((c) => {
      const diff = calendarDaysBetween(c.date, anchorDate);
      return diff >= -45 && diff <= 3;
    });
    if (plausible.length > 0) candidates = plausible;
    else return { date: null, time: null };
  }

  candidates.sort((a, b) => {
    if (Boolean(a.time) !== Boolean(b.time)) return a.time ? -1 : 1;
    if (anchorDate) {
      const aFuture = calendarDaysBetween(a.date, anchorDate) > 1 ? 1 : 0;
      const bFuture = calendarDaysBetween(b.date, anchorDate) > 1 ? 1 : 0;
      if (aFuture !== bFuture) return aFuture - bFuture;
      const da = Math.abs(calendarDaysBetween(a.date, anchorDate));
      const db = Math.abs(calendarDaysBetween(b.date, anchorDate));
      if (da !== db) return da - db;
    }
    return a.idx - b.idx;
  });

  return { date: candidates[0].date, time: candidates[0].time };
}

export function extractDateFromNotes(
  notes: string | null | undefined,
  anchorIso?: string | null,
): string | null {
  if (!notes) return null;
  const cleaned = notes.replace(/\[[^\]]*\]/g, ' ').trim();
  if (!cleaned) return null;
  return extractReceiptDateTime(cleaned, anchorIso).date;
}
