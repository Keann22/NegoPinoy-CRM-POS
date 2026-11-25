export interface PdfTextItem {
  str: string;
  transform: number[];
}

export interface StatementTransaction {
  index: number;
  date: string | null;
  rawDate: string;
  description: string;
  refNo: string | null;
  amount: number | null;
  direction: 'credit' | 'debit' | 'unknown';
  isBankOrRemittance: boolean;
  channelLabel: string | null;
  rawLine: string;
}

interface PositionedRow {
  y: number;
  parts: { x: number; str: string }[];
  rawLine: string;
}

interface ColumnLayout {
  debitX: number | null;
  creditX: number | null;
  balanceX: number | null;
}

interface CoreRowDraft {
  row: PositionedRow;
  refIdx: number;
  refNo: string | null;
  amount: number | null;
  amountX: number | null;
  amountNegative: boolean;
  dateIso: string | null;
  rawDate: string;
  beforeTexts: string[];
  afterTexts: string[];
}

const MONTHS: Record<string, string> = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
  apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10',
  nov: '11', november: '11', dec: '12', december: '12',
};

const CHANNEL_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\b(international\s*remit\w*|overseas\s*remit\w*|remittance|alipayhk|western\s*union|remitly|worldremit|moneygram|taptap\s*send|xoom|ria|wise|paypal)\b/i,
    label: 'International Remittance',
  },
  { pattern: /\binstapay\b/i, label: 'InstaPay' },
  { pattern: /\bpesonet\b/i, label: 'PESONet' },
  { pattern: /\bpalawan\s*(?:pawnshop|pay)?\b/i, label: 'Palawan' },
  { pattern: /\b(pj\s*lhuillier|cebuana)\b/i, label: 'Cebuana / PJ Lhuillier' },
  { pattern: /\b(asia\s*united\s*bank|\baub\b)\b/i, label: 'AUB' },
  { pattern: /\b(dcpay|coins\.?ph)\b/i, label: 'Coins.ph / DCPay' },
  { pattern: /\bunobank\b/i, label: 'UnoBank' },
  { pattern: /\bunion\s*bank\b|\bubp\b/i, label: 'UnionBank' },
  { pattern: /\bbdo\b/i, label: 'BDO' },
  { pattern: /\bbpi\b/i, label: 'BPI' },
  { pattern: /\bmetrobank\b/i, label: 'Metrobank' },
  { pattern: /\bland\s*bank\b/i, label: 'Landbank' },
  { pattern: /\bpnb\b/i, label: 'PNB' },
  { pattern: /\brcbc\b/i, label: 'RCBC' },
  { pattern: /\bsecurity\s*bank\b/i, label: 'Security Bank' },
  { pattern: /\bchina\s*bank\b/i, label: 'Chinabank' },
  { pattern: /\beast\s*west\b/i, label: 'EastWest' },
  { pattern: /\b(maya|paymaya)\b/i, label: 'Maya' },
  { pattern: /\bgotyme\b/i, label: 'GoTyme' },
  { pattern: /\b(seabank|maribank)\b/i, label: 'SeaBank' },
  { pattern: /\bcimb\b/i, label: 'CIMB' },
  { pattern: /\btonik\b/i, label: 'Tonik' },
  { pattern: /\bbank\s*transfer\b|\bbank\b/i, label: 'Bank Transfer' },
  { pattern: /\bcash[\s-]*in\b/i, label: 'Cash In' },
  { pattern: /\breceived\s+gcash\s+from\b/i, label: 'Bank Transfer' },
];

const SKIP_LINE_RE =
  /^(?:gcash\s+transaction\s+history|date\s+and\s+time\b|(?:starting|ending)\s+balance\b|page\s+\d+\s+of\s+\d+$|20\d{2}-\d{2}-\d{2}\s+to\s+20\d{2}-\d{2}-\d{2}$)/i;
const ATTACH_PREV_RE =
  /^(?:invno:|and\s+invno:|via\s+pesonet|\d{16,}$|\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s+invno:)/i;
const ATTACH_NEXT_RE = /^(?:received\s+gcash\s+from|sent\s+gcash\s+to|alipayhk|cash[\s-]*in\b)/i;
const STANDALONE_DT_RE =
  /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/20\d{2}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+20\d{2})\s+\d{1,2}:\d{2}\s*(?:AM|PM)?$/i;

const DEBIT_DESC_RE =
  /\b(transfer\s+to|send\s+money\s+to|sent\s+to|sent\s+gcash\s+to|express\s+send\s+to|pay\s+bills|buy\s+load|payment\s+to|withdraw|cash\s*out|bank\s+transfer\s+to|gcash\s+padala\s+sent)\b/i;
const CREDIT_DESC_RE =
  /\b(transfer\s+from|receive\w*|cash[\s-]*in|remit\w*|international|overseas|deposit|refund|credited|from\s+(?:bdo|bpi|union\s*bank|metrobank|landbank|pnb|rcbc|maya|seabank|gotyme|cimb|chinabank|eastwest|security\s*bank))\b/i;

const pad2 = (n: number) => String(n).padStart(2, '0');

function normalizeDate(line: string): { iso: string | null; raw: string } {
  const isoMatch = line.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return { iso: isoMatch[0], raw: isoMatch[0] };

  const mdyMatch = line.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (mdyMatch) {
    const a = Number(mdyMatch[1]);
    const b = Number(mdyMatch[2]);
    const [m, d] = a > 12 ? [b, a] : [a, b];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { iso: `${mdyMatch[3]}-${pad2(m)}-${pad2(d)}`, raw: mdyMatch[0] };
    }
  }

  const monFirst = line.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (monFirst) {
    const m = MONTHS[monFirst[1].toLowerCase()];
    const d = Number(monFirst[2]);
    if (m && d >= 1 && d <= 31) return { iso: `${monFirst[3]}-${m}-${pad2(d)}`, raw: monFirst[0] };
  }

  const dayFirst = line.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/);
  if (dayFirst) {
    const m = MONTHS[dayFirst[2].toLowerCase()];
    const d = Number(dayFirst[1]);
    if (m && d >= 1 && d <= 31) return { iso: `${dayFirst[3]}-${m}-${pad2(d)}`, raw: dayFirst[0] };
  }

  return { iso: null, raw: '' };
}

function detectChannel(desc: string): string | null {
  for (const { pattern, label } of CHANNEL_PATTERNS) {
    if (pattern.test(desc)) return label;
  }
  return null;
}

function parseMoneyToken(raw: string): number | null {
  const cleaned = raw.trim().replace(/^[₱$]|^php\s*/i, '');
  if (!/^-?[\d,]+(?:\.\d{2})$/.test(cleaned)) return null;
  const val = parseFloat(cleaned.replace(/,/g, ''));
  return Number.isFinite(val) ? Math.abs(val) : null;
}

function groupRows(items: PdfTextItem[]): PositionedRow[] {
  const Y_TOLERANCE = 2;
  const buckets: { y: number; parts: { x: number; str: string }[] }[] = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = item.transform[5];
    const x = item.transform[4];
    let row = buckets.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, parts: [] };
      buckets.push(row);
    }
    row.parts.push({ x, str: item.str });
  }
  buckets.sort((a, b) => b.y - a.y);
  return buckets
    .map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      return { y: r.y, parts: r.parts, rawLine: r.parts.map((p) => p.str).join(' ').trim() };
    })
    .filter((r) => Boolean(r.rawLine));
}

function detectColumnLayout(rows: PositionedRow[], existing: ColumnLayout): ColumnLayout {
  for (const row of rows) {
    const joined = row.rawLine.toLowerCase();
    if (!joined.includes('debit') && !joined.includes('credit')) continue;
    let { debitX, creditX, balanceX } = existing;
    for (const part of row.parts) {
      const lower = part.str.toLowerCase();
      if (lower.includes('debit')) debitX = part.x;
      else if (lower.includes('credit')) creditX = part.x;
      else if (lower.includes('balance')) balanceX = part.x;
    }
    return { debitX, creditX, balanceX };
  }
  return existing;
}

function tryCreateCoreDraft(row: PositionedRow, layout: ColumnLayout): CoreRowDraft | null {
  if (SKIP_LINE_RE.test(row.rawLine)) return null;
  const tokens = row.rawLine.split(/\s+/);

  let refIdx = -1;
  let refNo: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const digits = tokens[i].replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 16 && !tokens[i].includes('/') && !tokens[i].includes('-')) {
      if (digits.length === 13 || refIdx === -1) {
        refIdx = i;
        refNo = digits;
      }
    }
  }

  const moneyCandidates: { tokenIdx: number; value: number; isNegative: boolean; x: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const val = parseMoneyToken(tokens[i]);
    if (val === null) continue;
    const partMatch = row.parts.find((p) => p.str.includes(tokens[i]));
    moneyCandidates.push({
      tokenIdx: i,
      value: val,
      isNegative: tokens[i].trim().startsWith('-'),
      x: partMatch ? partMatch.x : 0,
    });
  }

  if (!refNo && moneyCandidates.length === 0) return null;

  let amount: number | null = null;
  let amountX: number | null = null;
  let amountNegative = false;

  if (refIdx !== -1 && refIdx + 1 < tokens.length) {
    const nextVal = parseMoneyToken(tokens[refIdx + 1]);
    if (nextVal !== null) {
      amount = nextVal;
      amountNegative = tokens[refIdx + 1].trim().startsWith('-');
      amountX = moneyCandidates.find((c) => c.tokenIdx === refIdx + 1)?.x ?? null;
    }
  }

  if (amount === null && moneyCandidates.length > 0) {
    const usable =
      moneyCandidates.length >= 2 && layout.balanceX !== null
        ? moneyCandidates.filter((c) => Math.abs(c.x - layout.balanceX!) > 25)
        : moneyCandidates.length >= 2
          ? moneyCandidates.slice(0, -1)
          : moneyCandidates;
    const chosen = usable[0] || moneyCandidates[0];
    amount = chosen.value;
    amountNegative = chosen.isNegative;
    amountX = chosen.x;
  }

  const { iso: dateIso, raw: rawDate } = normalizeDate(row.rawLine);
  return {
    row,
    refIdx,
    refNo,
    amount,
    amountX,
    amountNegative,
    dateIso,
    rawDate,
    beforeTexts: [],
    afterTexts: [],
  };
}

function attachOrphans(rows: PositionedRow[], layout: ColumnLayout): CoreRowDraft[] {
  const entries: { row: PositionedRow; draft: CoreRowDraft | null }[] = rows.map((row) => ({
    row,
    draft: tryCreateCoreDraft(row, layout),
  }));

  const findPrevCore = (idx: number): CoreRowDraft | null => {
    for (let i = idx - 1; i >= 0; i--) if (entries[i].draft) return entries[i].draft;
    return null;
  };
  const findNextCore = (idx: number): CoreRowDraft | null => {
    for (let i = idx + 1; i < entries.length; i++) if (entries[i].draft) return entries[i].draft;
    return null;
  };

  for (let i = 0; i < entries.length; i++) {
    if (entries[i].draft) continue;
    const line = entries[i].row.rawLine;
    if (SKIP_LINE_RE.test(line)) continue;

    const prev = findPrevCore(i);
    const next = findNextCore(i);
    if (!prev && !next) continue;

    if (ATTACH_PREV_RE.test(line) && prev) {
      prev.afterTexts.push(line);
      if (!prev.dateIso) {
        const dt = normalizeDate(line);
        if (dt.iso) {
          prev.dateIso = dt.iso;
          prev.rawDate = dt.raw;
        }
      }
      continue;
    }

    if (ATTACH_NEXT_RE.test(line) && next) {
      next.beforeTexts.push(line);
      continue;
    }

    if (STANDALONE_DT_RE.test(line)) {
      const target =
        prev && !prev.dateIso && (!next || next.dateIso)
          ? prev
          : next && !next.dateIso && (!prev || prev.dateIso)
            ? next
            : prev && next
              ? Math.abs(prev.row.y - entries[i].row.y) <= Math.abs(next.row.y - entries[i].row.y)
                ? prev
                : next
              : prev || next;
      if (target) {
        const dt = normalizeDate(line);
        if (!target.dateIso && dt.iso) {
          target.dateIso = dt.iso;
          target.rawDate = dt.raw;
        }
        target.beforeTexts.push(line);
      }
      continue;
    }

    const prevDist = prev ? Math.abs(prev.row.y - entries[i].row.y) : Infinity;
    const nextDist = next ? Math.abs(next.row.y - entries[i].row.y) : Infinity;
    if (Math.min(prevDist, nextDist) <= 16) {
      if (prevDist <= nextDist && prev) prev.afterTexts.push(line);
      else if (next) next.beforeTexts.push(line);
    }
  }

  return entries.map((e) => e.draft).filter((d): d is CoreRowDraft => d !== null);
}

function finalizeTransaction(draft: CoreRowDraft, layout: ColumnLayout, index: number): StatementTransaction {
  const combinedLine = [...draft.beforeTexts, draft.row.rawLine, ...draft.afterTexts].join(' ').trim();

  let direction: StatementTransaction['direction'] = 'unknown';
  if (draft.amountNegative || DEBIT_DESC_RE.test(combinedLine)) {
    direction = 'debit';
  } else if (layout.debitX !== null && layout.creditX !== null && draft.amountX !== null) {
    const distCredit = Math.abs(draft.amountX - layout.creditX);
    const distDebit = Math.abs(draft.amountX - layout.debitX);
    if (distCredit + 10 < distDebit) direction = 'credit';
    else if (distDebit + 10 < distCredit) direction = 'debit';
  }
  if (direction === 'unknown' && CREDIT_DESC_RE.test(combinedLine)) {
    direction = 'credit';
  }

  const descPart = draft.rawDate ? combinedLine.replace(draft.rawDate, '').trim() : combinedLine;
  const channelLabel = detectChannel(descPart);

  return {
    index,
    date: draft.dateIso,
    rawDate: draft.rawDate,
    description: descPart,
    refNo: draft.refNo,
    amount: draft.amount,
    direction,
    isBankOrRemittance: channelLabel !== null,
    channelLabel,
    rawLine: combinedLine,
  };
}

export function parseStatementItems(pagesItems: PdfTextItem[][]): {
  transactions: StatementTransaction[];
  rawLines: string[];
  dateRange: { min: string | null; max: string | null };
} {
  const transactions: StatementTransaction[] = [];
  const rawLines: string[] = [];
  let layout: ColumnLayout = { debitX: null, creditX: null, balanceX: null };

  for (const pageItems of pagesItems) {
    const rows = groupRows(pageItems);
    layout = detectColumnLayout(rows, layout);
    for (const row of rows) rawLines.push(row.rawLine);

    const drafts = attachOrphans(rows, layout);
    for (const draft of drafts) {
      if (draft.refNo || (draft.dateIso && draft.amount !== null)) {
        transactions.push(finalizeTransaction(draft, layout, transactions.length));
      }
    }
  }

  const dates = transactions.map((t) => t.date).filter((d): d is string => d !== null).sort();
  return {
    transactions,
    rawLines,
    dateRange: { min: dates[0] ?? null, max: dates[dates.length - 1] ?? null },
  };
}
