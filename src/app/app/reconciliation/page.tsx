"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { normalizeHeader, parseCsv } from "../_lib/csv";
import { uuid } from "../_lib/localStore";
import { loadBankTxns, saveBankTxns, type BankTxn } from "../_lib/bankTxns";
import { addBatchStat, listBatchStats, type BatchStat } from "../_lib/batchStats";
import { suggestAllocationForTxn } from "../_lib/statementSuggest";
import {
  buildSuggestions,
  type InvoiceRow,
  type ReceiptRow,
} from "../_lib/reconcileMatcher";

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

export default function ReconciliationPage() {
  const companyId = useMemo(() => getCompanyId() ?? "", []);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);

  const [txns, setTxns] = useState<BankTxn[]>(companyId ? loadBankTxns(companyId) : []);
  const [error, setError] = useState<string | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [pageSize, setPageSize] = useState<50 | 100 | 200>(100);
  const [pageIndex, setPageIndex] = useState(0);
  const [lastBatchMessage, setLastBatchMessage] = useState<string | null>(null);
  const [batchStats, setBatchStats] = useState<BatchStat[]>(companyId ? listBatchStats(companyId) : []);

  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [showMapper, setShowMapper] = useState(false);
  const [mapDate, setMapDate] = useState("");
  const [mapPostingDate, setMapPostingDate] = useState("");
  const [mapTransactionDate, setMapTransactionDate] = useState("");
  const [mapDesc, setMapDesc] = useState("");
  const [mapOrigDesc, setMapOrigDesc] = useState("");
  const [mapParentCategory, setMapParentCategory] = useState("");
  const [mapCategory, setMapCategory] = useState("");
  const [mapAccount, setMapAccount] = useState("");
  const [mapNr, setMapNr] = useState("");
  const [mapAmount, setMapAmount] = useState("");
  const [mapDebit, setMapDebit] = useState("");
  const [mapCredit, setMapCredit] = useState("");
  const [mapMoneyIn, setMapMoneyIn] = useState("");
  const [mapMoneyOut, setMapMoneyOut] = useState("");
  const [mapFee, setMapFee] = useState("");
  const [mapBalance, setMapBalance] = useState("");
  const [mapCurrency, setMapCurrency] = useState("");
  const [useDebitCredit, setUseDebitCredit] = useState(false);
  const [useMoneyInOut, setUseMoneyInOut] = useState(false);

  function persist(next: BankTxn[]) {
    setTxns(next);
    if (companyId) saveBankTxns(companyId, next);
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
      if (nextCompanyId) setTxns(loadBankTxns(nextCompanyId));
      if (nextCompanyId) setBatchStats(listBatchStats(nextCompanyId));
    }
    window.addEventListener("ledgerly:companyChanged", onCompanyChanged);
    return () => window.removeEventListener("ledgerly:companyChanged", onCompanyChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  async function onFile(file: File) {
    setError(null);
    setShowMapper(false);
    const text = await readTextLikeFile(file).catch((e) => {
      throw new Error(e instanceof Error ? e.message : "Failed to read file.");
    });
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setError("CSV looks empty.");
      return;
    }

    const rawHeaderRow = rows[0] || [];
    const header = rawHeaderRow.map(normalizeHeader);
    const idxTxnDate = header.findIndex((h) => ["transaction_date", "transactiondate"].includes(h));
    const idxPostDate = header.findIndex((h) =>
      ["posting_date", "posted_date", "postingdate", "value_date", "date"].includes(h),
    );
    const idxDate = idxTxnDate !== -1 ? idxTxnDate : idxPostDate;
    const idxDesc = header.findIndex((h) =>
      ["description", "merchant", "narration", "details", "reference"].includes(h),
    );
    const idxOrigDesc = header.findIndex((h) => ["original_description", "orig_description"].includes(h));
    const idxParentCat = header.findIndex((h) => ["parent_category", "parentcategory"].includes(h));
    const idxCat = header.findIndex((h) => ["category", "transaction_category"].includes(h));
    const idxAccount = header.findIndex((h) => ["account", "account_number"].includes(h));
    const idxNr = header.findIndex((h) => ["nr", "no", "number"].includes(h));
    const idxAmt = header.findIndex((h) =>
      ["amount", "value", "transaction_amount", "amount_local"].includes(h),
    );
    const idxDebit = header.findIndex((h) =>
      ["debit", "withdrawal", "money_out"].includes(h),
    );
    const idxCredit = header.findIndex((h) =>
      ["credit", "deposit", "money_in"].includes(h),
    );
    const idxMoneyIn = header.findIndex((h) => ["money_in", "credit", "deposit"].includes(h));
    const idxMoneyOut = header.findIndex((h) => ["money_out", "debit", "withdrawal"].includes(h));
    const idxFee = header.findIndex((h) => ["fee", "fees", "charge"].includes(h));
    const idxBalance = header.findIndex((h) => ["balance", "running_balance"].includes(h));
    const idxCur = header.findIndex((h) => ["currency", "ccy"].includes(h));

    const detectedMode: "amount" | "debit_credit" | "money_in_out" =
      idxAmt !== -1
        ? "amount"
        : idxMoneyIn !== -1 && idxMoneyOut !== -1
          ? "money_in_out"
          : idxDebit !== -1 && idxCredit !== -1
            ? "debit_credit"
            : "amount";

    const canAuto =
      idxDate !== -1 &&
      idxDesc !== -1 &&
      (idxAmt !== -1 ||
        (idxDebit !== -1 && idxCredit !== -1) ||
        (idxMoneyIn !== -1 && idxMoneyOut !== -1));

    if (!canAuto) {
      setError(
        "We couldn’t detect your bank CSV columns. Map them below (date / description / amount or money in/out).",
      );
      setRawHeaders(rawHeaderRow);
      setRawRows(rows.slice(1));
      setShowMapper(true);
      setMapDate(idxDate !== -1 ? rawHeaderRow[idxDate] || "" : "");
      setMapPostingDate(idxPostDate !== -1 ? rawHeaderRow[idxPostDate] || "" : "");
      setMapTransactionDate(idxTxnDate !== -1 ? rawHeaderRow[idxTxnDate] || "" : "");
      setMapDesc(idxDesc !== -1 ? rawHeaderRow[idxDesc] || "" : "");
      setMapOrigDesc(idxOrigDesc !== -1 ? rawHeaderRow[idxOrigDesc] || "" : "");
      setMapParentCategory(idxParentCat !== -1 ? rawHeaderRow[idxParentCat] || "" : "");
      setMapCategory(idxCat !== -1 ? rawHeaderRow[idxCat] || "" : "");
      setMapAccount(idxAccount !== -1 ? rawHeaderRow[idxAccount] || "" : "");
      setMapNr(idxNr !== -1 ? rawHeaderRow[idxNr] || "" : "");
      setMapAmount(idxAmt !== -1 ? rawHeaderRow[idxAmt] || "" : "");
      setMapDebit(idxDebit !== -1 ? rawHeaderRow[idxDebit] || "" : "");
      setMapCredit(idxCredit !== -1 ? rawHeaderRow[idxCredit] || "" : "");
      setMapMoneyIn(idxMoneyIn !== -1 ? rawHeaderRow[idxMoneyIn] || "" : "");
      setMapMoneyOut(idxMoneyOut !== -1 ? rawHeaderRow[idxMoneyOut] || "" : "");
      setMapFee(idxFee !== -1 ? rawHeaderRow[idxFee] || "" : "");
      setMapBalance(idxBalance !== -1 ? rawHeaderRow[idxBalance] || "" : "");
      setMapCurrency(idxCur !== -1 ? rawHeaderRow[idxCur] || "" : "");
      setUseDebitCredit(detectedMode === "debit_credit");
      setUseMoneyInOut(detectedMode === "money_in_out");
      return;
    }

    const parsed = parseWithMapping({
      header: rawHeaderRow,
      rows: rows.slice(1),
      mapDate: rawHeaderRow[idxDate] || "",
      mapPostingDate: idxPostDate !== -1 ? rawHeaderRow[idxPostDate] || "" : "",
      mapTransactionDate: idxTxnDate !== -1 ? rawHeaderRow[idxTxnDate] || "" : "",
      mapDesc: rawHeaderRow[idxDesc] || "",
      mapOrigDesc: idxOrigDesc !== -1 ? rawHeaderRow[idxOrigDesc] || "" : "",
      mapParentCategory: idxParentCat !== -1 ? rawHeaderRow[idxParentCat] || "" : "",
      mapCategory: idxCat !== -1 ? rawHeaderRow[idxCat] || "" : "",
      mapAccount: idxAccount !== -1 ? rawHeaderRow[idxAccount] || "" : "",
      mapNr: idxNr !== -1 ? rawHeaderRow[idxNr] || "" : "",
      mapAmount: idxAmt !== -1 ? rawHeaderRow[idxAmt] || "" : "",
      mapDebit: idxDebit !== -1 ? rawHeaderRow[idxDebit] || "" : "",
      mapCredit: idxCredit !== -1 ? rawHeaderRow[idxCredit] || "" : "",
      mapMoneyIn: idxMoneyIn !== -1 ? rawHeaderRow[idxMoneyIn] || "" : "",
      mapMoneyOut: idxMoneyOut !== -1 ? rawHeaderRow[idxMoneyOut] || "" : "",
      mapFee: idxFee !== -1 ? rawHeaderRow[idxFee] || "" : "",
      mapBalance: idxBalance !== -1 ? rawHeaderRow[idxBalance] || "" : "",
      mapCurrency: idxCur !== -1 ? rawHeaderRow[idxCur] || "" : "",
      useDebitCredit: detectedMode === "debit_credit",
      useMoneyInOut: detectedMode === "money_in_out",
    });

    if (parsed.length === 0) {
      setError("No rows parsed. Check the CSV format.");
      setRawHeaders(rawHeaderRow);
      setRawRows(rows.slice(1));
      setShowMapper(true);
      return;
    }
    persist(parsed);
    setPageIndex(0);
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

  function flipInOut(txnId: string) {
    const next = txns.map((t) => {
      if (t.id !== txnId) return t;
      const moneyIn = t.money_in ?? null;
      const moneyOut = t.money_out ?? null;
      const flipped: BankTxn = {
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
      return flipped;
    });
    persist(next);
  }

  function applyAutoSuggestionsToBatch(opts: { allocate: boolean }) {
    if (!companyId) return;
    const next = [...txns];
    const idxById = new Map(next.map((t, i) => [t.id, i]));
    let applied = 0;
    for (const t of pageTxns) {
      if (t.matched_id) continue;
      if (t.allocated && opts.allocate) continue;
      const i = idxById.get(t.id);
      if (i == null) continue;
      const suggestion = suggestAllocationForTxn({ companyId, txn: next[i]! });
      const merged: BankTxn = {
        ...next[i]!,
        ...suggestion,
      };
      const shouldAllocate =
        opts.allocate &&
        Boolean(merged.allocation_category || merged.allocation_account_code || merged.allocation_tax_treatment);
      next[i] = {
        ...merged,
        allocated: shouldAllocate ? true : merged.allocated,
        matched_kind: shouldAllocate ? null : merged.matched_kind,
        matched_id: shouldAllocate ? null : merged.matched_id,
      };
      applied++;
    }
    if (applied > 0) persist(next);
    setLastBatchMessage(
      opts.allocate
        ? `Auto-suggested + allocated ${applied} transaction(s) in this batch.`
        : `Auto-suggested fields for ${applied} transaction(s) in this batch.`,
    );
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

  const suggestions = useMemo(() => {
    return buildSuggestions({ txns, receipts, invoices });
  }, [txns, receipts, invoices]);

  const totals = useMemo(() => {
    const linked = txns.filter((t) => Boolean(t.matched_id)).length;
    const missingOut = txns.filter((t) => t.amount < 0 && !t.matched_id && !t.allocated).length;
    const missingIn = txns.filter((t) => t.amount > 0 && !t.matched_id && !t.allocated).length;
    const suggested = txns.filter((t) => !t.matched_id && suggestions[t.id]).length;
    return { linked, missingOut, missingIn, suggested };
  }, [txns, suggestions]);

  const visibleTxns = showMissingOnly
    ? txns.filter((t) => !t.matched_id && !t.allocated)
    : txns;
  const pageCount = Math.max(1, Math.ceil(visibleTxns.length / pageSize));
  const clampedPageIndex = Math.min(pageIndex, pageCount - 1);
  const pageTxns = visibleTxns.slice(
    clampedPageIndex * pageSize,
    clampedPageIndex * pageSize + pageSize,
  );

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
            accept=""
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

      {showMapper ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Column mapper
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Select which columns represent date, description, and amount. Many banks export with different headers or semicolon delimiters.
          </p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <SelectMap label="Date" value={mapDate} onChange={setMapDate} options={rawHeaders} />
            <SelectMap label="Posting date (optional)" value={mapPostingDate} onChange={setMapPostingDate} options={rawHeaders} allowBlank />
            <SelectMap label="Transaction date (optional)" value={mapTransactionDate} onChange={setMapTransactionDate} options={rawHeaders} allowBlank />
            <SelectMap label="Description" value={mapDesc} onChange={setMapDesc} options={rawHeaders} />
            <SelectMap label="Original description (optional)" value={mapOrigDesc} onChange={setMapOrigDesc} options={rawHeaders} allowBlank />
            <SelectMap label="Parent category (optional)" value={mapParentCategory} onChange={setMapParentCategory} options={rawHeaders} allowBlank />
            <SelectMap label="Category (optional)" value={mapCategory} onChange={setMapCategory} options={rawHeaders} allowBlank />
            <SelectMap label="Account (optional)" value={mapAccount} onChange={setMapAccount} options={rawHeaders} allowBlank />
            <SelectMap label="Nr (optional)" value={mapNr} onChange={setMapNr} options={rawHeaders} allowBlank />
            {!useDebitCredit && !useMoneyInOut ? (
              <SelectMap label="Amount" value={mapAmount} onChange={setMapAmount} options={rawHeaders} />
            ) : null}
            <SelectMap label="Currency (optional)" value={mapCurrency} onChange={setMapCurrency} options={rawHeaders} allowBlank />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={useDebitCredit}
                onChange={(e) => {
                  const next = e.target.checked;
                  setUseDebitCredit(next);
                  if (next) setUseMoneyInOut(false);
                }}
              />
              Use debit/credit columns instead of amount
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={useMoneyInOut}
                onChange={(e) => {
                  const next = e.target.checked;
                  setUseMoneyInOut(next);
                  if (next) setUseDebitCredit(false);
                }}
              />
              Use money in/out columns instead of amount
            </label>
          </div>
          {useDebitCredit ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <SelectMap label="Debit" value={mapDebit} onChange={setMapDebit} options={rawHeaders} />
              <SelectMap label="Credit" value={mapCredit} onChange={setMapCredit} options={rawHeaders} />
            </div>
          ) : null}
          {useMoneyInOut ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <SelectMap label="Money in" value={mapMoneyIn} onChange={setMapMoneyIn} options={rawHeaders} />
              <SelectMap label="Money out" value={mapMoneyOut} onChange={setMapMoneyOut} options={rawHeaders} />
              <SelectMap label="Fee (optional)" value={mapFee} onChange={setMapFee} options={rawHeaders} allowBlank />
              <SelectMap label="Balance (optional)" value={mapBalance} onChange={setMapBalance} options={rawHeaders} allowBlank />
            </div>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setShowMapper(false)}
              className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const parsed = parseWithMapping({
                  header: rawHeaders,
                  rows: rawRows,
                  mapDate,
                  mapPostingDate,
                  mapTransactionDate,
                  mapDesc,
                  mapOrigDesc,
                  mapParentCategory,
                  mapCategory,
                  mapAccount,
                  mapNr,
                  mapAmount,
                  mapDebit,
                  mapCredit,
                  mapMoneyIn,
                  mapMoneyOut,
                  mapFee,
                  mapBalance,
                  mapCurrency,
                  useDebitCredit,
                  useMoneyInOut,
                });
                if (parsed.length === 0) {
                  setError("No rows parsed. Check your column mapping.");
                  return;
                }
                persist(parsed);
                setPageIndex(0);
                setShowMapper(false);
                void loadDocs();
              }}
              className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Import with mapping
            </button>
          </div>
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

      {lastBatchMessage ? (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {lastBatchMessage}
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
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Batch</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as 50 | 100 | 200);
                setPageIndex(0);
              }}
              className="h-9 rounded-xl border border-black/10 bg-white px-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Batch {clampedPageIndex + 1} / {pageCount}
          </div>
          <button
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={clampedPageIndex === 0}
            className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Prev
          </button>
          <button
            onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
            disabled={clampedPageIndex >= pageCount - 1}
            className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Next
          </button>
          <button
            onClick={() => applyAutoSuggestionsToBatch({ allocate: false })}
            className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Auto-suggest (batch)
          </button>
          <button
            onClick={() => applyAutoSuggestionsToBatch({ allocate: true })}
            className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Allocate suggested (batch)
          </button>
          <button
            onClick={() => {
              const next = [...txns];
              const idxById = new Map(next.map((t, i) => [t.id, i]));
              let applied = 0;
              for (const t of pageTxns) {
                if (t.matched_id) continue;
                const s = suggestions[t.id];
                if (!s) continue;
                const i = idxById.get(t.id);
                if (i == null) continue;
                next[i] = { ...next[i]!, matched_kind: s.kind, matched_id: s.id, allocated: false };
                applied++;
              }
              if (applied > 0) persist(next);
              if (companyId) {
                addBatchStat(companyId, {
                  source: "reconciliation",
                  action: "match_suggested_batch",
                  batch_size: pageSize,
                  page_index: clampedPageIndex,
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
            className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Match suggested (batch)
          </button>
          <button
            onClick={downloadAllocatedCsv}
            className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Export allocations (CSV)
          </button>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {docsLoading
              ? "Loading receipts/invoices…"
              : `Docs: ${receipts.length} receipts • ${invoices.length} invoices`}
          </div>
        </div>
      ) : null}

      {txns.length > 0 ? (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          “Auto-suggest” uses your saved Rules + bank categories (no AI). True AI statement analysis + posting to Sage needs backend endpoints.
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
                  <th className="px-4 py-3 font-medium">Nr</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Posting date</th>
                  <th className="px-4 py-3 font-medium">Txn date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Orig desc</th>
                  <th className="px-4 py-3 font-medium">Parent cat</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Money in</th>
                  <th className="px-4 py-3 font-medium">Money out</th>
                  <th className="px-4 py-3 font-medium">Fee</th>
                  <th className="px-4 py-3 font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Net</th>
                  <th className="px-4 py-3 font-medium">In/Out</th>
                  <th className="px-4 py-3 font-medium">Matched</th>
                  <th className="px-4 py-3 font-medium">Suggestion</th>
                  <th className="px-4 py-3 font-medium">Allocation</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {pageTxns.map((t) => {
                  const suggestion = suggestions[t.id];
                  const dir = t.amount < 0 ? "Out" : "In";
                  return (
                  <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">{t.nr || "—"}</td>
                    <td className="px-4 py-3">{t.account || "—"}</td>
                    <td className="px-4 py-3">{t.posting_date || "—"}</td>
                    <td className="px-4 py-3">{t.transaction_date || t.date || "—"}</td>
                    <td className="px-4 py-3">{t.description}</td>
                    <td className="px-4 py-3">{t.original_description || "—"}</td>
                    <td className="px-4 py-3">{t.parent_category || "—"}</td>
                    <td className="px-4 py-3">{t.statement_category || "—"}</td>
                    <td className="px-4 py-3">{t.money_in != null ? t.money_in.toFixed(2) : "—"}</td>
                    <td className="px-4 py-3">{t.money_out != null ? t.money_out.toFixed(2) : "—"}</td>
                    <td className="px-4 py-3">{t.fee != null ? t.fee.toFixed(2) : "—"}</td>
                    <td className="px-4 py-3">{t.balance != null ? t.balance.toFixed(2) : "—"}</td>
                    <td className="px-4 py-3">{t.amount.toFixed(2)} {t.currency}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => flipInOut(t.id)}
                        className={[
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                          dir === "Out"
                            ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                            : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                        ].join(" ")}
                        title="Click to flip in/out"
                      >
                        {dir}
                      </button>
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
                    <td className="px-4 py-3">
                      {t.allocated ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-800 dark:text-emerald-200">
                          Allocated
                        </span>
                      ) : t.allocation_category || t.allocation_account_code || t.statement_category ? (
                        <div className="text-xs text-zinc-700 dark:text-zinc-300">
                          {t.allocation_category || t.statement_category || "—"}
                          {t.allocation_account_code ? ` • ${t.allocation_account_code}` : ""}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>
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
            items={txns.filter((t) => t.amount < 0 && !t.matched_id && !t.allocated)}
          />
          <MissingList
            title="Missing invoices (money in)"
            items={txns.filter((t) => t.amount > 0 && !t.matched_id && !t.allocated)}
          />
        </div>
      ) : null}

      {companyId && batchStats.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Batch history
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {batchStats.length}
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {batchStats.slice(0, 6).map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-black/10 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-zinc-950 dark:text-zinc-50">
                    {b.source} • {b.action}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(b.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  Batch {b.page_index + 1} • size {b.batch_size} • applied {b.applied} • ok {b.succeeded} • failed {b.failed}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SelectMap({
  label,
  value,
  onChange,
  options,
  allowBlank,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allowBlank?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
      >
        {allowBlank ? <option value="">(none)</option> : null}
        {options.map((h) => (
          <option key={h} value={h}>
            {h || "(blank)"}
          </option>
        ))}
      </select>
    </label>
  );
}

function toIndexByHeader(rawHeaders: string[]) {
  const map = new Map<string, number>();
  rawHeaders.forEach((h, i) => {
    const key = (h || "").trim();
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

function parseNumber(raw: string): number | null {
  const cleaned = (raw || "").trim().replace(/[^0-9.+-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseWithMapping(args: {
  header: string[];
  rows: string[][];
  mapDate: string;
  mapPostingDate: string;
  mapTransactionDate: string;
  mapDesc: string;
  mapOrigDesc: string;
  mapParentCategory: string;
  mapCategory: string;
  mapAccount: string;
  mapNr: string;
  mapAmount: string;
  mapDebit: string;
  mapCredit: string;
  mapMoneyIn: string;
  mapMoneyOut: string;
  mapFee: string;
  mapBalance: string;
  mapCurrency: string;
  useDebitCredit: boolean;
  useMoneyInOut: boolean;
}): BankTxn[] {
  const idx = toIndexByHeader(args.header);
  const idxDate = idx.get((args.mapDate || "").trim()) ?? -1;
  const idxPostingDate = args.mapPostingDate ? idx.get((args.mapPostingDate || "").trim()) ?? -1 : -1;
  const idxTransactionDate = args.mapTransactionDate ? idx.get((args.mapTransactionDate || "").trim()) ?? -1 : -1;
  const idxDesc = idx.get((args.mapDesc || "").trim()) ?? -1;
  const idxOrigDesc = args.mapOrigDesc ? idx.get((args.mapOrigDesc || "").trim()) ?? -1 : -1;
  const idxParentCat = args.mapParentCategory ? idx.get((args.mapParentCategory || "").trim()) ?? -1 : -1;
  const idxCat = args.mapCategory ? idx.get((args.mapCategory || "").trim()) ?? -1 : -1;
  const idxAccount = args.mapAccount ? idx.get((args.mapAccount || "").trim()) ?? -1 : -1;
  const idxNr = args.mapNr ? idx.get((args.mapNr || "").trim()) ?? -1 : -1;
  const idxAmt = idx.get((args.mapAmount || "").trim()) ?? -1;
  const idxDebit = idx.get((args.mapDebit || "").trim()) ?? -1;
  const idxCredit = idx.get((args.mapCredit || "").trim()) ?? -1;
  const idxMoneyIn = idx.get((args.mapMoneyIn || "").trim()) ?? -1;
  const idxMoneyOut = idx.get((args.mapMoneyOut || "").trim()) ?? -1;
  const idxFee = args.mapFee ? idx.get((args.mapFee || "").trim()) ?? -1 : -1;
  const idxBalance = args.mapBalance ? idx.get((args.mapBalance || "").trim()) ?? -1 : -1;
  const idxCur = args.mapCurrency ? idx.get((args.mapCurrency || "").trim()) ?? -1 : -1;

  if (idxDate === -1 || idxDesc === -1) return [];
  if (!args.useDebitCredit && !args.useMoneyInOut && idxAmt === -1) return [];
  if (args.useDebitCredit && (idxDebit === -1 || idxCredit === -1)) return [];
  if (args.useMoneyInOut && (idxMoneyIn === -1 || idxMoneyOut === -1)) return [];

  const parsed: BankTxn[] = [];
  for (const r of args.rows) {
    const mapDate = (r[idxDate] || "").trim();
    const postingDate = idxPostingDate !== -1 ? (r[idxPostingDate] || "").trim() : "";
    const transactionDate = idxTransactionDate !== -1 ? (r[idxTransactionDate] || "").trim() : "";
    const date = transactionDate || postingDate || mapDate;
    const description = (r[idxDesc] || "").trim();
    const currency = idxCur !== -1 ? (r[idxCur] || "ZAR").trim().toUpperCase() : "ZAR";
    let amount: number | null = null;
    const fee = idxFee !== -1 ? parseNumber(r[idxFee] || "") : null;
    const balance = idxBalance !== -1 ? parseNumber(r[idxBalance] || "") : null;
    let moneyIn: number | null = null;
    let moneyOut: number | null = null;

    if (args.useMoneyInOut) {
      moneyIn = parseNumber(r[idxMoneyIn] || "") ?? 0;
      moneyOut = parseNumber(r[idxMoneyOut] || "") ?? 0;
      const feeVal = fee ?? 0;
      amount = moneyIn - moneyOut - feeVal;
    } else if (args.useDebitCredit) {
      const debit = parseNumber(r[idxDebit] || "") ?? 0;
      const credit = parseNumber(r[idxCredit] || "") ?? 0;
      // Convention: credit is positive, debit is negative.
      amount = credit - debit;
    } else {
      amount = parseNumber(r[idxAmt] || "");
    }
    if (!date || !description || amount == null) continue;

    const originalDescription = idxOrigDesc !== -1 ? (r[idxOrigDesc] || "").trim() : "";
    const parentCategory = idxParentCat !== -1 ? (r[idxParentCat] || "").trim() : "";
    const statementCategory = idxCat !== -1 ? (r[idxCat] || "").trim() : "";
    const account = idxAccount !== -1 ? (r[idxAccount] || "").trim() : "";
    const nr = idxNr !== -1 ? (r[idxNr] || "").trim() : "";

    parsed.push({
      id: uuid(),
      date,
      posting_date: postingDate || null,
      transaction_date: transactionDate || null,
      description,
      original_description: originalDescription || null,
      parent_category: parentCategory || null,
      statement_category: statementCategory || null,
      amount,
      currency,
      money_in: moneyIn,
      money_out: moneyOut,
      fee,
      balance,
      account: account || null,
      nr: nr || null,
      direction_override: null,
      matched_kind: null,
      matched_id: null,
    });
  }
  return parsed;
}

async function readTextLikeFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // XLSX/ZIP signature: PK\003\004
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    throw new Error(
      "This looks like an Excel (.xlsx) file. Please export/download as CSV (comma/semicolon/tab separated) and import again.",
    );
  }

  // Detect UTF-16 by presence of NUL bytes.
  const sampleLen = Math.min(bytes.length, 4096);
  let nulCount = 0;
  for (let i = 0; i < sampleLen; i++) if (bytes[i] === 0) nulCount++;
  const looksUtf16 = nulCount / Math.max(1, sampleLen) > 0.05;

  const stripBom = (s: string) => s.replace(/^\uFEFF/, "");

  if (looksUtf16) {
    // Try LE then BE.
    try {
      const le = stripBom(new TextDecoder("utf-16le").decode(bytes));
      if (le.includes(",") || le.includes(";") || le.includes("\t")) return le;
    } catch {
      // ignore
    }
    try {
      const be = stripBom(new TextDecoder("utf-16be").decode(bytes));
      return be;
    } catch {
      // ignore
    }
  }

  // Default UTF-8 (handles UTF-8 BOM too).
  try {
    return stripBom(new TextDecoder("utf-8").decode(bytes));
  } catch {
    // Fallback to File.text()
    return stripBom(await file.text());
  }
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
