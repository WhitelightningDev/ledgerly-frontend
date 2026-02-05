"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { normalizeHeader, parseCsv } from "../_lib/csv";
import { loadFromLocalStorage, saveToLocalStorage, uuid } from "../_lib/localStore";

import { getApiUrl } from "../../_lib/apiUrl";

function getToken() {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem("ledgerly_access_token");
}

function getCompanyId() {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem("ledgerly_company_id");
}

type ApiError = { detail?: string };

type BankTxn = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  matched_kind: "receipt" | "invoice" | null;
  matched_id: string | null;
};

function key(companyId: string) {
  return `ledgerly:bankTxns:${companyId}`;
}

function loadTxns(companyId: string): BankTxn[] {
  return loadFromLocalStorage<BankTxn[]>(key(companyId), []);
}

function saveTxns(companyId: string, txns: BankTxn[]) {
  saveToLocalStorage(key(companyId), txns);
}

type ReceiptRow = {
  id: string;
  vendor: string | null;
  receipt_date: string | null;
  created_at: string;
  currency: string;
  total_amount: number | null;
};

type InvoiceRow = {
  id: string;
  client_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  created_at: string;
  currency: string;
  total_amount: number | null;
};

type MatchSuggestion = {
  kind: "receipt" | "invoice";
  id: string;
  label: string;
  score: number;
};

export default function ReconciliationPage() {
  const companyId = useMemo(() => getCompanyId() ?? "", []);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);

  const [txns, setTxns] = useState<BankTxn[]>(companyId ? loadTxns(companyId) : []);
  const [error, setError] = useState<string | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [showMissingOnly, setShowMissingOnly] = useState(false);

  function persist(next: BankTxn[]) {
    setTxns(next);
    if (companyId) saveTxns(companyId, next);
  }

  async function loadDocs() {
    if (!token || !companyId) return;
    setDocsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ company_id: companyId, limit: "800" });
      const [rRes, iRes] = await Promise.all([
        fetch(`${apiUrl}/receipts?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/invoices?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const rData = (await rRes.json()) as ReceiptRow[] | ApiError;
      if (!rRes.ok) throw new Error((rData as ApiError).detail || "Failed to load receipts.");
      const iData = (await iRes.json()) as InvoiceRow[] | ApiError;
      if (!iRes.ok) throw new Error((iData as ApiError).detail || "Failed to load invoices.");
      setReceipts(Array.isArray(rData) ? rData : []);
      setInvoices(Array.isArray(iData) ? iData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents.");
      setReceipts([]);
      setInvoices([]);
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    void loadDocs();
    function onCompanyChanged() {
      void loadDocs();
      const nextCompanyId = getCompanyId() ?? "";
      if (nextCompanyId) setTxns(loadTxns(nextCompanyId));
    }
    window.addEventListener("ledgerly:companyChanged", onCompanyChanged);
    return () => window.removeEventListener("ledgerly:companyChanged", onCompanyChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  async function onFile(file: File) {
    setError(null);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setError("CSV looks empty.");
      return;
    }

    const header = rows[0].map(normalizeHeader);
    const idxDate = header.findIndex((h) => ["date", "transaction_date", "posted_date"].includes(h));
    const idxDesc = header.findIndex((h) =>
      ["description", "merchant", "narration", "details"].includes(h),
    );
    const idxAmt = header.findIndex((h) => ["amount", "value", "debit", "credit"].includes(h));
    const idxCur = header.findIndex((h) => ["currency", "ccy"].includes(h));

    if (idxDate === -1 || idxDesc === -1 || idxAmt === -1) {
      setError(
        "CSV must include columns like date, description, amount (currency optional).",
      );
      return;
    }

    const parsed: BankTxn[] = [];
    for (const r of rows.slice(1)) {
      const date = (r[idxDate] || "").trim();
      const description = (r[idxDesc] || "").trim();
      const amtRaw = (r[idxAmt] || "").trim().replace(/[^0-9.+-]/g, "");
      const amount = Number(amtRaw);
      const currency = idxCur !== -1 ? (r[idxCur] || "USD").trim().toUpperCase() : "USD";
      if (!date || !description || !Number.isFinite(amount)) continue;
      parsed.push({
        id: uuid(),
        date,
        description,
        amount,
        currency,
        matched_kind: null,
        matched_id: null,
      });
    }

    if (parsed.length === 0) {
      setError("No rows parsed. Check the CSV format.");
      return;
    }
    persist(parsed);
    void loadDocs();
  }

  function clearAll() {
    persist([]);
  }

  function linkTxn(txnId: string, kind: "receipt" | "invoice", id: string) {
    const next = txns.map((t) =>
      t.id === txnId ? { ...t, matched_kind: kind, matched_id: id } : t,
    );
    persist(next);
  }

  function unlinkTxn(txnId: string) {
    const next = txns.map((t) =>
      t.id === txnId ? { ...t, matched_kind: null, matched_id: null } : t,
    );
    persist(next);
  }

  const usedDocIds = useMemo(() => {
    const used = new Set<string>();
    for (const t of txns) {
      if (t.matched_id) used.add(`${t.matched_kind}:${t.matched_id}`);
    }
    return used;
  }, [txns]);

  const suggestions = useMemo(() => {
    const out: Record<string, MatchSuggestion | null> = {};
    const receiptIndex = indexDocs(
      receipts
        .filter((r) => r.total_amount != null)
        .map((r) => ({
          id: r.id,
          kind: "receipt" as const,
          name: r.vendor || "Unknown vendor",
          dayKey: dayKeyFromDocDate(r.receipt_date, r.created_at),
          amount: r.total_amount as number,
        })),
    );
    const invoiceIndex = indexDocs(
      invoices
        .filter((i) => i.total_amount != null)
        .map((i) => ({
          id: i.id,
          kind: "invoice" as const,
          name:
            (i.client_name || "Unknown client") +
            (i.invoice_number ? ` • ${i.invoice_number}` : ""),
          dayKey: dayKeyFromDocDate(i.invoice_date, i.created_at),
          amount: i.total_amount as number,
        })),
    );

    for (const t of txns) {
      if (t.matched_id) {
        out[t.id] = null;
        continue;
      }
      const bankDay = dayKeyFromBankDate(t.date);
      const isMoneyOut = t.amount < 0;
      const targetAmount = Math.abs(t.amount);
      const idx = isMoneyOut ? receiptIndex : invoiceIndex;
      const suggestion = bestSuggestion({
        index: idx,
        targetAmount,
        bankDayKey: bankDay,
        description: t.description,
        usedDocIds,
      });
      out[t.id] = suggestion;
    }
    return out;
  }, [txns, receipts, invoices, usedDocIds]);

  const totals = useMemo(() => {
    const linked = txns.filter((t) => Boolean(t.matched_id)).length;
    const missingOut = txns.filter((t) => t.amount < 0 && !t.matched_id).length;
    const missingIn = txns.filter((t) => t.amount > 0 && !t.matched_id).length;
    const suggested = txns.filter((t) => !t.matched_id && suggestions[t.id]).length;
    return { linked, missingOut, missingIn, suggested };
  }, [txns, suggestions]);

  const visibleTxns = showMissingOnly ? txns.filter((t) => !t.matched_id) : txns;

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Import bank CSV and auto-match receipts/invoices. One-click linking, plus a missing list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!companyId}
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Import CSV
          </button>
          <button
            onClick={clearAll}
            disabled={txns.length === 0}
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Clear
          </button>
          <button
            onClick={() => void loadDocs()}
            disabled={!companyId || !token || docsLoading}
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {docsLoading ? "Loading docs..." : "Refresh docs"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {!companyId ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            Select a company first.
          </div>
        </div>
      ) : null}

      {companyId ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <SummaryCard title="Imported txns" value={String(txns.length)} />
          <SummaryCard title="Linked" value={String(totals.linked)} />
          <SummaryCard title="Suggested" value={String(totals.suggested)} />
          <SummaryCard
            title="Missing"
            value={`${totals.missingOut + totals.missingIn}`}
            hint={`${totals.missingOut} out • ${totals.missingIn} in`}
          />
        </div>
      ) : null}

      {txns.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={showMissingOnly}
              onChange={(e) => setShowMissingOnly(e.target.checked)}
            />
            Show missing only
          </label>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {docsLoading
              ? "Loading receipts/invoices…"
              : `Docs: ${receipts.length} receipts • ${invoices.length} invoices`}
          </div>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-black">
        {txns.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300">
            No bank transactions imported.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Matched</th>
                  <th className="px-4 py-3 font-medium">Suggestion</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {visibleTxns.slice(0, 300).map((t) => {
                  const suggestion = suggestions[t.id];
                  return (
                  <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">{t.date}</td>
                    <td className="px-4 py-3">{t.description}</td>
                    <td className="px-4 py-3">
                      {t.amount.toFixed(2)} {t.currency}
                    </td>
                    <td className="px-4 py-3">
                      {t.matched_id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                            {t.matched_kind}
                          </span>
                          <Link
                            href={
                              t.matched_kind === "invoice"
                                ? `/app/invoices/${t.matched_id}`
                                : `/app/inbox/${t.matched_id}`
                            }
                            className="text-xs font-medium underline"
                          >
                            Open
                          </Link>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.matched_id ? (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          —
                        </span>
                      ) : suggestion ? (
                        <div className="text-xs text-zinc-700 dark:text-zinc-300">
                          {suggestion.label}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          No suggestion
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.matched_id ? (
                        <button
                          onClick={() => unlinkTxn(t.id)}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 px-4 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:text-red-300"
                        >
                          Unlink
                        </button>
                      ) : suggestion ? (
                        <button
                          onClick={() => linkTxn(t.id, suggestion.kind, suggestion.id)}
                          className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                        >
                          Match suggested
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {txns.length > 0 ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <MissingList
            title="Missing receipts (money out)"
            items={txns.filter((t) => t.amount < 0 && !t.matched_id)}
          />
          <MissingList
            title="Missing invoices (money in)"
            items={txns.filter((t) => t.amount > 0 && !t.matched_id)}
          />
        </div>
      ) : null}
    </main>
  );
}

function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? (
        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>
      ) : null}
    </div>
  );
}

function MissingList({ title, items }: { title: string; items: BankTxn[] }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          {title}
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {items.length}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
          None
        </div>
      ) : (
        <ul className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {items.slice(0, 12).map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-black/10 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-zinc-950 dark:text-zinc-50">
                  {t.description}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t.amount.toFixed(2)} {t.currency}
                </div>
              </div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                {t.date}
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 12 ? (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Showing first 12.
        </div>
      ) : null}
    </div>
  );
}

function cents(amount: number) {
  return Math.round(amount * 100);
}

function normalizeText(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dayKeyFromDocDate(dateOrNull: string | null, fallbackIso: string) {
  const raw = (dateOrNull || fallbackIso || "").slice(0, 10);
  return raw;
}

function dayKeyFromBankDate(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Try DD/MM/YYYY or DD/MM/YY
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

type IndexedDoc = {
  id: string;
  kind: "receipt" | "invoice";
  name: string;
  dayKey: string;
  amount: number;
};

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
}): MatchSuggestion | null {
  const targetC = cents(args.targetAmount);
  const desc = normalizeText(args.description);

  // Search +/- $1.00 in 5c increments.
  const maxWindow = 100;
  let best: { doc: IndexedDoc; score: number } | null = null;
  for (let delta = -maxWindow; delta <= maxWindow; delta += 5) {
    const bucket = args.index[targetC + delta];
    if (!bucket) continue;
    for (const d of bucket) {
      const usedKey = `${d.kind}:${d.id}`;
      if (args.usedDocIds.has(usedKey)) continue;

      const amountDelta = Math.abs((targetC + delta) - targetC);
      const amountScore = 1 - Math.min(1, amountDelta / 100); // within $1

      const diff = dayDiff(d.dayKey, args.bankDayKey);
      const absDays = diff == null ? 10 : Math.abs(diff);
      if (absDays > 7) continue;
      const dateScore = 1 - Math.min(1, absDays / 7);

      const name = normalizeText(d.name);
      const textScore = name && (desc.includes(name) || name.includes(desc)) ? 1 : name && desc.includes(name.split(" ")[0] || "") ? 0.5 : 0;

      const score = amountScore * 0.6 + dateScore * 0.3 + textScore * 0.1;
      if (!best || score > best.score) best = { doc: d, score };
    }
  }

  if (!best || best.score < 0.55) return null;
  return {
    kind: best.doc.kind,
    id: best.doc.id,
    label: `${best.doc.name} • ${best.doc.dayKey} • $${best.doc.amount.toFixed(2)}`,
    score: best.score,
  };
}
