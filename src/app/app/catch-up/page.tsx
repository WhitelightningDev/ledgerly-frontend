"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  loadBankTxns,
  saveBankTxns,
  type BankTxn,
} from "../_lib/bankTxns";
import { addBatchStat, listBatchStats, type BatchStat } from "../_lib/batchStats";
import {
  buildSuggestions,
  type InvoiceRow,
  type MatchSuggestion,
  type ReceiptRow,
} from "../_lib/reconcileMatcher";

const ZAR_FORMAT =
  typeof Intl === "undefined"
    ? null
    : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

function formatZar(amount: number | null) {
  if (amount == null) return "—";
  try {
    return ZAR_FORMAT ? ZAR_FORMAT.format(amount) : `R${amount.toFixed(2)}`;
  } catch {
    return `R${amount.toFixed(2)}`;
  }
}

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

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

type Step = "overview" | "match" | "post";

type PostResult = {
  key: string;
  ok: boolean;
  message: string;
};

export default function CatchUpWizardPage() {
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);
  const companyId = useMemo(() => getCompanyId() ?? "", []);

  const [step, setStep] = useState<Step>("overview");
  const [error, setError] = useState<string | null>(null);

  const [txns, setTxns] = useState<BankTxn[]>(companyId ? loadBankTxns(companyId) : []);
  const [docsLoading, setDocsLoading] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  const [activeTxnId, setActiveTxnId] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState<50 | 100 | 200>(50);
  const [batchIndex, setBatchIndex] = useState(0);
  const [lastBatchMessage, setLastBatchMessage] = useState<string | null>(null);
  const [batchStats, setBatchStats] = useState<BatchStat[]>(companyId ? listBatchStats(companyId) : []);
  const [posting, setPosting] = useState(false);
  const [postResults, setPostResults] = useState<PostResult[]>([]);
  const [selectedToPost, setSelectedToPost] = useState<Record<string, boolean>>({});

  function persistTxns(next: BankTxn[]) {
    setTxns(next);
    if (companyId) saveBankTxns(companyId, next);
  }

  function downloadAllocatedCsv() {
    const allocated = txns.filter((t) => Boolean(t.allocated) && !t.matched_id);
    const headers = [
      "date",
      "posting_date",
      "transaction_date",
      "description",
      "money_in",
      "money_out",
      "fee",
      "balance",
      "net_amount",
      "currency",
      "category",
      "account_code",
      "tax_treatment",
      "notes",
    ];
    const rows = allocated.map((t) => [
      t.date || "",
      t.posting_date || "",
      t.transaction_date || "",
      t.description || "",
      t.money_in != null ? String(t.money_in) : "",
      t.money_out != null ? String(t.money_out) : "",
      t.fee != null ? String(t.fee) : "",
      t.balance != null ? String(t.balance) : "",
      String(t.amount),
      t.currency || "",
      t.allocation_category || t.statement_category || "",
      t.allocation_account_code || "",
      t.allocation_tax_treatment || "",
      t.allocation_notes || "",
    ]);
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => esc(c)).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ledgerly_allocations.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function loadDocs() {
    if (!token || !companyId) return;
    setDocsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ company_id: companyId, limit: "1200" });
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
      const nextCompanyId = getCompanyId() ?? "";
      setTxns(nextCompanyId ? loadBankTxns(nextCompanyId) : []);
      setBatchStats(nextCompanyId ? listBatchStats(nextCompanyId) : []);
      setActiveTxnId(null);
      setSelectedToPost({});
      setPostResults([]);
      setLastBatchMessage(null);
      void loadDocs();
    }
    window.addEventListener("ledgerly:companyChanged", onCompanyChanged);
    return () => window.removeEventListener("ledgerly:companyChanged", onCompanyChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  const allocated = txns.filter((t) => Boolean(t.allocated) && !t.matched_id);
  const unmatched = txns.filter((t) => !t.matched_id && !t.allocated);
  const matched = txns.filter((t) => Boolean(t.matched_id));

  const suggestions = useMemo(() => {
    return buildSuggestions({ txns, receipts, invoices });
  }, [txns, receipts, invoices]);

  const suggestedCount = unmatched.filter((t) => Boolean(suggestions[t.id])).length;

  const receiptById = useMemo(() => {
    const map = new Map<string, ReceiptRow>();
    for (const r of receipts) map.set(r.id, r);
    return map;
  }, [receipts]);
  const invoiceById = useMemo(() => {
    const map = new Map<string, InvoiceRow>();
    for (const i of invoices) map.set(i.id, i);
    return map;
  }, [invoices]);

  useEffect(() => {
    if (!activeTxnId && unmatched.length > 0) setActiveTxnId(unmatched[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unmatched.length]);

  const batchCount = Math.max(1, Math.ceil(unmatched.length / batchSize));
  const clampedBatchIndex = Math.min(batchIndex, batchCount - 1);
  const batchUnmatched = unmatched.slice(
    clampedBatchIndex * batchSize,
    clampedBatchIndex * batchSize + batchSize,
  );

  useEffect(() => {
    if (activeTxnId && !batchUnmatched.some((t) => t.id === activeTxnId)) {
      setActiveTxnId(batchUnmatched[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedBatchIndex, batchSize, unmatched.length]);

  function link(txnId: string, kind: "receipt" | "invoice", id: string) {
    persistTxns(
      txns.map((t) =>
        t.id === txnId
          ? {
              ...t,
              matched_kind: kind,
              matched_id: id,
              allocated: false,
              allocation_direction: undefined,
              allocation_category: undefined,
              allocation_account_code: undefined,
              allocation_tax_treatment: undefined,
              allocation_notes: undefined,
            }
          : t,
      ),
    );
  }

  function applySuggestion(txn: BankTxn, suggestion: MatchSuggestion) {
    link(txn.id, suggestion.kind, suggestion.id);
  }

  function flipInOut(txnId: string) {
    persistTxns(
      txns.map((t) => {
        if (t.id !== txnId) return t;
        const moneyIn = t.money_in ?? null;
        const moneyOut = t.money_out ?? null;
        return {
          ...t,
          amount: -t.amount,
          money_in: moneyOut,
          money_out: moneyIn,
          direction_override: null,
          matched_kind: null,
          matched_id: null,
          allocated: false,
          allocation_direction: t.amount < 0 ? "money_in" : "money_out",
        };
      }),
    );
  }

  function allocateTxn(txnId: string, updates: Partial<BankTxn>) {
    persistTxns(
      txns.map((t) =>
        t.id === txnId
          ? {
              ...t,
              matched_kind: null,
              matched_id: null,
              ...updates,
              allocated: updates.allocated ?? t.allocated ?? false,
              allocation_direction:
                updates.allocation_direction ??
                t.allocation_direction ??
                (t.amount < 0 ? "money_out" : "money_in"),
            }
          : t,
      ),
    );
  }

  function clearAllocation(txnId: string) {
    persistTxns(
      txns.map((t) =>
        t.id === txnId
          ? {
              ...t,
              allocated: false,
              allocation_direction: undefined,
              allocation_category: undefined,
              allocation_account_code: undefined,
              allocation_tax_treatment: undefined,
              allocation_notes: undefined,
            }
          : t,
      ),
    );
  }

  function nextUnmatched() {
    const idx = batchUnmatched.findIndex((t) => t.id === activeTxnId);
    const next = batchUnmatched[idx + 1] || null;
    setActiveTxnId(next?.id ?? null);
  }

  function prevUnmatched() {
    const idx = batchUnmatched.findIndex((t) => t.id === activeTxnId);
    const prev = idx > 0 ? batchUnmatched[idx - 1] : null;
    setActiveTxnId(prev?.id ?? null);
  }

  const activeTxn = batchUnmatched.find((t) => t.id === activeTxnId) ?? null;
  const activeSuggestion = activeTxn ? suggestions[activeTxn.id] : null;
  const activeDirection =
    activeTxn == null ? null : activeTxn.amount < 0 ? "money_out" : "money_in";

  const candidatesForActive = useMemo(() => {
    if (!activeTxn) return [];
    const isOut = activeTxn.amount < 0;
    const abs = Math.abs(activeTxn.amount);
    const list = (isOut ? receipts : invoices)
      .filter((d) => d.total_amount != null)
      .map((d) => {
        const amountDelta = Math.abs(Math.abs(d.total_amount as number) - abs);
        const score = Math.max(0, 1 - amountDelta / 5); // within $5
        return { d, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ d }) => d);
    return list;
  }, [activeTxn, receipts, invoices]);

  const postable = useMemo(() => {
    const keys: Array<{ key: string; kind: "receipt" | "invoice"; id: string; status: string }> = [];
    for (const t of matched) {
      if (!t.matched_id || !t.matched_kind) continue;
      const k = `${t.matched_kind}:${t.matched_id}`;
      if (t.matched_kind === "receipt") {
        const r = receiptById.get(t.matched_id);
        if (r) keys.push({ key: k, kind: "receipt", id: r.id, status: r.status });
      } else {
        const inv = invoiceById.get(t.matched_id);
        if (inv) keys.push({ key: k, kind: "invoice", id: inv.id, status: inv.workflow_status });
      }
    }
    // Deduplicate by key
    const seen = new Set<string>();
    return keys.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
  }, [matched, receiptById, invoiceById]);

  async function postBatch() {
    if (!token) return;
    setPosting(true);
    setError(null);
    setPostResults([]);
    try {
      const selected = postable.filter((p) => selectedToPost[p.key]);
      const results: PostResult[] = [];
      let succeeded = 0;
      let failed = 0;
      for (const p of selected) {
        const endpoint =
          p.kind === "receipt" ? `receipts/${p.id}/post` : `invoices/${p.id}/post`;
        try {
          const res = await fetch(`${apiUrl}/${endpoint}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          const bodyText = await res.text();
          if (!res.ok) throw new Error(bodyText || "Post failed.");
          succeeded++;
          results.push({ key: p.key, ok: true, message: "Posted" });
        } catch (e) {
          failed++;
          results.push({
            key: p.key,
            ok: false,
            message: e instanceof Error ? e.message : "Post failed.",
          });
        }
      }
      setPostResults(results);
      if (companyId) {
        addBatchStat(companyId, {
          source: "catch_up",
          action: "post_batch",
          batch_size: batchSize,
          page_index: clampedBatchIndex,
          applied: selected.length,
          succeeded,
          failed,
        });
        setBatchStats(listBatchStats(companyId));
      }
      setLastBatchMessage(
        selected.length > 0
          ? `Posted ${succeeded} succeeded • ${failed} failed (batch ${clampedBatchIndex + 1}/${batchCount}).`
          : "No items selected to post.",
      );
      await loadDocs();
    } finally {
      setPosting(false);
    }
  }

  const selectedCount = Object.values(selectedToPost).filter(Boolean).length;

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catch-up wizard</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Walk through unmatched bank transactions, accept AI suggestions, then post in batches.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/reconciliation"
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Reconciliation
          </Link>
          <button
            onClick={() => void loadDocs()}
            disabled={!companyId || !token || docsLoading}
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {docsLoading ? "Loading…" : "Refresh docs"}
          </button>
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
            Select a company and import a bank CSV in Reconciliation first.
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <SummaryCard title="Imported txns" value={String(txns.length)} />
        <SummaryCard title="Unmatched" value={String(unmatched.length)} />
        <SummaryCard title="Matched" value={String(matched.length)} />
        <SummaryCard title="Suggested" value={String(suggestedCount)} />
        <SummaryCard title="Allocated" value={String(allocated.length)} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <StepButton active={step === "overview"} onClick={() => setStep("overview")} label="1. Overview" />
        <StepButton active={step === "match"} onClick={() => setStep("match")} label="2. Match" />
        <StepButton active={step === "post"} onClick={() => setStep("post")} label="3. Post" />
      </div>

      {lastBatchMessage ? (
        <div className="mt-4 rounded-xl border border-black/10 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
          {lastBatchMessage}
        </div>
      ) : null}

      {step === "overview" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">How to use</div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              <li>Import your bank CSV in Reconciliation.</li>
              <li>Go to Match and accept suggestions or link manually.</li>
              <li>Go to Post and batch post approved items to Sage.</li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={() => setStep("match")}
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Start matching
              </button>
              <button
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("ledgerly:upload", {
                      detail: { type: "receipt" as const },
                    }),
                  )
                }
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
              >
                Upload missing receipt
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Notes</div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Posting requires the document to be approved. If a post fails, open the document,
              approve it, then retry posting here.
            </p>
          </div>
        </div>
      ) : null}

      {step === "match" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-black">
            {unmatched.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300">
                No unmatched transactions.
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 bg-zinc-50 px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                  <div>
                    Batch {clampedBatchIndex + 1} / {batchCount} • {batchUnmatched.length} items
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={batchSize}
                      onChange={(e) => {
                        setBatchSize(Number(e.target.value) as 50 | 100 | 200);
                        setBatchIndex(0);
                      }}
                      className="h-8 rounded-xl border border-black/10 bg-white px-2 text-xs text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                    <button
                      onClick={() => setBatchIndex((b) => Math.max(0, b - 1))}
                      disabled={clampedBatchIndex === 0}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-black/10 bg-white px-3 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setBatchIndex((b) => Math.min(batchCount - 1, b + 1))}
                      disabled={clampedBatchIndex >= batchCount - 1}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-black/10 bg-white px-3 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                    >
                      Next
                    </button>
                  </div>
                </div>

	                <div className="px-3 py-3">
	                  <button
	                    onClick={() => {
	                      const next = [...txns];
	                      const idxById = new Map(next.map((t, i) => [t.id, i]));
	                      let applied = 0;
	                      for (const t of batchUnmatched) {
	                        const s = suggestions[t.id];
	                        if (!s) continue;
	                        const i = idxById.get(t.id);
	                        if (i == null) continue;
	                        next[i] = { ...next[i]!, matched_kind: s.kind, matched_id: s.id, allocated: false };
	                        applied++;
	                      }
	                      if (applied > 0) persistTxns(next);
                        if (companyId) {
                          addBatchStat(companyId, {
                            source: "catch_up",
                            action: "match_suggested_batch",
                            batch_size: batchSize,
                            page_index: clampedBatchIndex,
                            applied,
                            succeeded: applied,
                            failed: 0,
                          });
                          setBatchStats(listBatchStats(companyId));
                        }
                        setLastBatchMessage(
                          applied > 0
                            ? `Matched ${applied} transaction(s) in this batch using suggestions.`
                            : "No suggestions to apply in this batch.",
                        );
	                    }}
	                    className="inline-flex h-9 w-full items-center justify-center rounded-full bg-zinc-950 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
	                  >
	                    Match all suggested (this batch)
	                  </button>
	                </div>

                <ul className="divide-y divide-black/5 dark:divide-white/10">
                {batchUnmatched.map((t) => {
                  const dir = t.amount < 0 ? "out" : "in";
                  return (
                  <li key={t.id}>
                    <button
                      onClick={() => setActiveTxnId(t.id)}
                      className={[
                        "w-full px-4 py-3 text-left text-sm transition-colors",
                        t.id === activeTxnId
                          ? "bg-zinc-950 text-white dark:bg-white dark:text-black"
                          : "hover:bg-zinc-50 dark:hover:bg-white/5",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                              dir === "out"
                                ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                                : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                            ].join(" ")}
                          >
                            {dir === "out" ? "Out" : "In"}
                          </span>
                          <div className="truncate font-medium">{t.description}</div>
                        </div>
	                        <div className="shrink-0 text-xs opacity-80">
	                          {formatZar(t.amount)}
	                        </div>
	                      </div>
	                      <div className="mt-1 text-xs opacity-80">{t.date}</div>
	                    </button>
	                  </li>
                  );
                })}
                </ul>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                Match
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={prevUnmatched}
                  disabled={!activeTxn || batchUnmatched[0]?.id === activeTxn.id}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  Prev
                </button>
                <button
                  onClick={nextUnmatched}
                  disabled={!activeTxn}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  Next
                </button>
              </div>
            </div>

            {!activeTxn ? (
              <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-300">
                Select a transaction.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-black/10 bg-zinc-50 p-4 text-sm dark:border-white/10 dark:bg-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-zinc-950 dark:text-zinc-50">
                      {activeTxn.description}
                    </div>
                    <button
                      type="button"
                      onClick={() => flipInOut(activeTxn.id)}
                      className={[
                        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                        activeDirection === "money_out"
                          ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                          : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                      ].join(" ")}
                      title="Click to flip money in/out"
                    >
                      {activeDirection === "money_out" ? "Money out" : "Money in"}
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    {activeTxn.date} • {formatZar(activeTxn.amount)}
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-zinc-600 dark:text-zinc-300 sm:grid-cols-2">
                    <div>Posting date: {activeTxn.posting_date || "—"}</div>
                    <div>Txn date: {activeTxn.transaction_date || activeTxn.date || "—"}</div>
                    <div>Category: {activeTxn.statement_category || "—"}</div>
                    <div>Balance: {activeTxn.balance != null ? activeTxn.balance.toFixed(2) : "—"}</div>
                    <div>Money in: {activeTxn.money_in != null ? activeTxn.money_in.toFixed(2) : "—"}</div>
                    <div>Money out: {activeTxn.money_out != null ? activeTxn.money_out.toFixed(2) : "—"}</div>
                  </div>
                </div>

                {activeSuggestion ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                      Suggested match
                    </div>
                    <div className="mt-2 text-sm text-emerald-800/90 dark:text-emerald-200/90">
                      {activeSuggestion.label}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => applySuggestion(activeTxn, activeSuggestion)}
                        className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        Match suggested
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-black/10 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                    No suggestion for this transaction.
                  </div>
                )}

                <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                      Quick candidates
                    </div>
                    <button
                      onClick={() => {
                        const type =
                          activeDirection === "money_out" ? "receipt" : "invoice";
                        window.dispatchEvent(
                          new CustomEvent("ledgerly:upload", { detail: { type } }),
                        );
                      }}
                      className="text-xs font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
                    >
                      Upload missing
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {candidatesForActive.map((d) => {
                      const isOut = activeTxn.amount < 0;
                      const kind = isOut ? ("receipt" as const) : ("invoice" as const);
                      const name =
                        kind === "receipt"
                          ? (d as ReceiptRow).vendor || "Unknown vendor"
                          : (d as InvoiceRow).client_name || "Unknown client";
                      const date =
                        kind === "receipt"
                          ? (d as ReceiptRow).receipt_date || (d as ReceiptRow).created_at
                          : (d as InvoiceRow).invoice_date || (d as InvoiceRow).created_at;
                      const status =
                        kind === "receipt" ? (d as ReceiptRow).status : (d as InvoiceRow).workflow_status;
                      return (
                        <button
                          key={d.id}
                          onClick={() => link(activeTxn.id, kind, d.id)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-zinc-950 dark:text-zinc-50">
                              {name}
                            </div>
                            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                              {String(date).slice(0, 10)} • {status}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-zinc-600 dark:text-zinc-300">
                            {formatZar(d.total_amount)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                      No doc? Allocate this transaction
                    </div>
                    {activeTxn.allocated ? (
                      <button
                        onClick={() => clearAllocation(activeTxn.id)}
                        className="text-xs font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
                      >
                        Unallocate
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                    Use this when there’s nothing to match (e.g., missing invoice/receipt). This is saved locally for now.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        Category
                      </div>
                      <input
                        value={activeTxn.allocation_category || ""}
                        onChange={(e) =>
                          allocateTxn(activeTxn.id, { allocation_category: e.target.value })
                        }
                        placeholder="e.g., Fuel"
                        className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm dark:border-white/10 dark:bg-black"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        Account code
                      </div>
                      <input
                        value={activeTxn.allocation_account_code || ""}
                        onChange={(e) =>
                          allocateTxn(activeTxn.id, { allocation_account_code: e.target.value })
                        }
                        placeholder="e.g., 4500"
                        className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm dark:border-white/10 dark:bg-black"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        Tax treatment
                      </div>
                      <input
                        value={activeTxn.allocation_tax_treatment || ""}
                        onChange={(e) =>
                          allocateTxn(activeTxn.id, { allocation_tax_treatment: e.target.value })
                        }
                        placeholder="e.g., VAT"
                        className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm dark:border-white/10 dark:bg-black"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        Notes
                      </div>
                      <input
                        value={activeTxn.allocation_notes || ""}
                        onChange={(e) =>
                          allocateTxn(activeTxn.id, { allocation_notes: e.target.value })
                        }
                        placeholder="Optional"
                        className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm dark:border-white/10 dark:bg-black"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        allocateTxn(activeTxn.id, { allocated: true });
                        nextUnmatched();
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    >
                      Mark allocated
                    </button>
                    <button
                      onClick={() => clearAllocation(activeTxn.id)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {step === "post" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Batch post
                </div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  Select matched items and post to Sage.
                </div>
              </div>
              <button
                onClick={() => void postBatch()}
                disabled={posting || selectedCount === 0}
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {posting ? "Posting..." : `Post ${selectedCount}`}
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
              {postable.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300">
                  No matched documents to post.
                </div>
              ) : (
                <ul className="divide-y divide-black/5 bg-white dark:divide-white/10 dark:bg-black">
                  {postable.map((p) => {
                    const checked = Boolean(selectedToPost[p.key]);
                    const result = postResults.find((r) => r.key === p.key) || null;
                    const isApproved =
                      p.kind === "receipt"
                        ? p.status === "approved"
                        : p.status === "approved";
                    return (
                      <li key={p.key} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedToPost((prev) => ({
                                ...prev,
                                [p.key]: e.target.checked,
                              }))
                            }
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                              {p.kind} • {p.id}
                            </div>
                            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                              Status: {p.status} {isApproved ? "" : "(approve first)"}
                            </div>
                          </div>
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={p.kind === "invoice" ? `/app/invoices/${p.id}` : `/app/inbox/${p.id}`}
                            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                          >
                            Open
                          </Link>
                          {result ? (
                            <span
                              className={[
                                "inline-flex items-center rounded-full px-3 py-1 text-xs",
                                result.ok
                                  ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                                  : "bg-red-500/10 text-red-800 dark:text-red-200",
                              ].join(" ")}
                            >
                              {result.ok ? "Posted" : "Failed"}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {postResults.length > 0 ? (
              <div className="mt-4 rounded-xl border border-black/10 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                {postResults.filter((r) => r.ok).length} succeeded •{" "}
                {postResults.filter((r) => !r.ok).length} failed
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Allocations (no document)
                </div>
                <button
                  onClick={downloadAllocatedCsv}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-3 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  Export CSV
                </button>
              </div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                {allocated.length} allocated transaction(s). Posting these to Sage requires backend support.
              </div>
              {allocated.length === 0 ? (
                <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">—</div>
              ) : (
                <ul className="mt-4 divide-y divide-black/5 text-sm dark:divide-white/10">
                  {allocated.slice(0, 10).map((t) => (
                    <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-950 dark:text-zinc-50">
                          {t.description}
                        </div>
                        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                          {t.date} • {t.allocation_direction === "money_in" ? "Money in" : "Money out"} •{" "}
                          {t.allocation_category || "Uncategorized"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-zinc-600 dark:text-zinc-300">
                          {formatZar(t.amount)}
                        </div>
                        <button
                          onClick={() => clearAllocation(t.id)}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-3 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                        >
                          Unallocate
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Quick select
            </div>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const p of postable) next[p.key] = true;
                  setSelectedToPost(next);
                }}
                className="inline-flex h-10 w-full items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedToPost({})}
                className="inline-flex h-10 w-full items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
              >
                Clear selection
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
              <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                Batch history
              </div>
              <div className="mt-3 space-y-2">
                {(batchStats || []).filter((s) => s.source === "catch_up").slice(0, 6).map((s) => (
                  <div key={s.id} className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {s.action === "match_suggested_batch" ? "Matched suggested" : "Posted batch"}
                      </span>
                      <span className="opacity-80">{String(s.created_at).slice(0, 19).replace("T", " ")}</span>
                    </div>
                    <div className="mt-1 opacity-80">
                      Batch {s.page_index + 1} • size {s.batch_size} • applied {s.applied} • ok {s.succeeded} • fail {s.failed}
                    </div>
                  </div>
                ))}
                {(batchStats || []).filter((s) => s.source === "catch_up").length === 0 ? (
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">No batches yet.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function StepButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors",
        active
          ? "bg-zinc-950 text-white dark:bg-white dark:text-black"
          : "border border-black/10 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/5",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
