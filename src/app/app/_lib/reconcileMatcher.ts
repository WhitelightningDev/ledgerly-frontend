import type { BankTxn } from "./bankTxns";

const ZAR_FORMAT =
  typeof Intl === "undefined"
    ? null
    : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

function formatZar(amount: number) {
  try {
    return ZAR_FORMAT ? ZAR_FORMAT.format(amount) : `R${amount.toFixed(2)}`;
  } catch {
    return `R${amount.toFixed(2)}`;
  }
}

export type ReceiptRow = {
  id: string;
  status: string;
  vendor: string | null;
  receipt_date: string | null;
  created_at: string;
  currency: string;
  total_amount: number | null;
};

export type InvoiceRow = {
  id: string;
  workflow_status: string;
  payment_status: string;
  client_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  created_at: string;
  currency: string;
  total_amount: number | null;
};

export type MatchSuggestion = {
  kind: "receipt" | "invoice";
  id: string;
  label: string;
  score: number;
};

type IndexedDoc = {
  id: string;
  kind: "receipt" | "invoice";
  name: string;
  dayKey: string;
  amount: number;
  status: string;
};

export function buildUsedDocIds(txns: BankTxn[]): Set<string> {
  const used = new Set<string>();
  for (const t of txns) {
    if (t.matched_id) used.add(`${t.matched_kind}:${t.matched_id}`);
  }
  return used;
}

export function cents(amount: number) {
  return Math.round(amount * 100);
}

export function normalizeText(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dayKeyFromDocDate(dateOrNull: string | null, fallbackIso: string) {
  return (dateOrNull || fallbackIso || "").slice(0, 10);
}

export function dayKeyFromBankDate(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const dd = m[1]!.padStart(2, "0");
    const mm = m[2]!.padStart(2, "0");
    let yy = m[3]!;
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function dayDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.round((da - db) / (24 * 60 * 60 * 1000));
}

function indexDocs(docs: IndexedDoc[]) {
  const map: Record<number, IndexedDoc[]> = {};
  for (const d of docs) {
    const key = cents(d.amount);
    (map[key] ||= []).push(d);
  }
  return map;
}

function bestSuggestion(args: {
  index: Record<number, IndexedDoc[]>;
  targetAmount: number;
  bankDayKey: string | null;
  description: string;
  usedDocIds: Set<string>;
  kind: "receipt" | "invoice";
}): MatchSuggestion | null {
  const targetC = cents(args.targetAmount);
  const desc = normalizeText(args.description);
  const maxWindow = 100; // +/- $1.00

  let best: { doc: IndexedDoc; score: number } | null = null;
  for (let delta = -maxWindow; delta <= maxWindow; delta += 5) {
    const bucket = args.index[targetC + delta];
    if (!bucket) continue;
    for (const d of bucket) {
      const usedKey = `${d.kind}:${d.id}`;
      if (args.usedDocIds.has(usedKey)) continue;

      const amountDelta = Math.abs((targetC + delta) - targetC);
      const amountScore = 1 - Math.min(1, amountDelta / 100);

      const diff = dayDiff(d.dayKey, args.bankDayKey);
      const absDays = diff == null ? 10 : Math.abs(diff);
      if (absDays > 7) continue;
      const dateScore = 1 - Math.min(1, absDays / 7);

      const name = normalizeText(d.name);
      const textScore =
        name && (desc.includes(name) || name.includes(desc))
          ? 1
          : name && desc.includes(name.split(" ")[0] || "")
            ? 0.5
            : 0;

      const score = amountScore * 0.6 + dateScore * 0.3 + textScore * 0.1;
      if (!best || score > best.score) best = { doc: d, score };
    }
  }

  if (!best || best.score < 0.55) return null;
  return {
    kind: args.kind,
    id: best.doc.id,
    label: `${best.doc.name} • ${best.doc.dayKey} • ${formatZar(best.doc.amount)}`,
    score: best.score,
  };
}

export function buildSuggestions(args: {
  txns: BankTxn[];
  receipts: ReceiptRow[];
  invoices: InvoiceRow[];
}): Record<string, MatchSuggestion | null> {
  const usedDocIds = buildUsedDocIds(args.txns);
  const receiptIndex = indexDocs(
    args.receipts
      .filter((r) => r.total_amount != null)
      .map((r) => ({
        id: r.id,
        kind: "receipt" as const,
        name: r.vendor || "Unknown vendor",
        dayKey: dayKeyFromDocDate(r.receipt_date, r.created_at),
        amount: r.total_amount as number,
        status: r.status,
      })),
  );
  const invoiceIndex = indexDocs(
    args.invoices
      .filter((i) => i.total_amount != null)
      .map((i) => ({
        id: i.id,
        kind: "invoice" as const,
        name:
          (i.client_name || "Unknown client") +
          (i.invoice_number ? ` • ${i.invoice_number}` : ""),
        dayKey: dayKeyFromDocDate(i.invoice_date, i.created_at),
        amount: i.total_amount as number,
        status: i.workflow_status,
      })),
  );

  const out: Record<string, MatchSuggestion | null> = {};
  for (const t of args.txns) {
    if (t.matched_id) {
      out[t.id] = null;
      continue;
    }
    const bankDay = dayKeyFromBankDate(t.date);
    const isMoneyOut = t.amount < 0;
    const targetAmount = Math.abs(t.amount);
    const description = (t.original_description || t.description || "").trim();
    out[t.id] = isMoneyOut
      ? bestSuggestion({
          index: receiptIndex,
          targetAmount,
          bankDayKey: bankDay,
          description,
          usedDocIds,
          kind: "receipt",
        })
      : bestSuggestion({
          index: invoiceIndex,
          targetAmount,
          bankDayKey: bankDay,
          description,
          usedDocIds,
          kind: "invoice",
        });
  }
  return out;
}
