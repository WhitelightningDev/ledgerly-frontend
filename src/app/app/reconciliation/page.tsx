"use client";

import { useMemo, useRef, useState } from "react";

import { normalizeHeader, parseCsv } from "../_lib/csv";
import { loadFromLocalStorage, saveToLocalStorage, uuid } from "../_lib/localStore";

function getCompanyId() {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem("ledgerly_company_id");
}

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

export default function ReconciliationPage() {
  const companyId = useMemo(() => getCompanyId() ?? "", []);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [txns, setTxns] = useState<BankTxn[]>(companyId ? loadTxns(companyId) : []);
  const [error, setError] = useState<string | null>(null);

  function persist(next: BankTxn[]) {
    setTxns(next);
    if (companyId) saveTxns(companyId, next);
  }

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
  }

  function clearAll() {
    persist([]);
  }

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Import bank CSV and match later. (Client-side MVP.)
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
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {txns.slice(0, 300).map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">{t.date}</td>
                    <td className="px-4 py-3">{t.description}</td>
                    <td className="px-4 py-3">
                      {t.amount.toFixed(2)} {t.currency}
                    </td>
                    <td className="px-4 py-3">
                      {t.matched_id ? `${t.matched_kind} ${t.matched_id}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

