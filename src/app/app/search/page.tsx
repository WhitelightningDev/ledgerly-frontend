"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

type ReceiptRow = {
  id: string;
  status: string;
  vendor: string | null;
  receipt_date: string | null;
  currency: string;
  total_amount: number | null;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  workflow_status: string;
  payment_status: string;
  client_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string;
  total_amount: number | null;
  created_at: string;
};

type Unified = {
  kind: "receipt" | "invoice";
  id: string;
  name: string;
  date: string | null;
  currency: string;
  amount: number | null;
  status: string;
  created_at: string;
  ref: string;
};

type AuditEvent = {
  id: string;
  action: string;
  actor: string | null;
  details_json: string | null;
  created_at: string;
};

function formatMoney(currency: string, amount: number | null) {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      amount,
    );
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function SearchPage() {
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Unified[]>([]);

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "receipt" | "invoice">("all");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [auditFor, setAuditFor] = useState<{ kind: "receipt" | "invoice"; id: string } | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  async function load() {
    if (!token) return;
    const companyId = getCompanyId();
    if (!companyId) return;

    setLoading(true);
    setError(null);
    try {
      const receiptsParams = new URLSearchParams({
        company_id: companyId,
        limit: "400",
      });
      const invoicesParams = new URLSearchParams({
        company_id: companyId,
        limit: "400",
      });

      const [receiptsRes, invoicesRes] = await Promise.all([
        fetch(`${apiUrl}/receipts?${receiptsParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/invoices?${invoicesParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const receiptsData = (await receiptsRes.json()) as ReceiptRow[] | ApiError;
      if (!receiptsRes.ok) throw new Error((receiptsData as ApiError).detail || "Failed to load receipts.");
      const invoicesData = (await invoicesRes.json()) as InvoiceRow[] | ApiError;
      if (!invoicesRes.ok) throw new Error((invoicesData as ApiError).detail || "Failed to load invoices.");

      const merged: Unified[] = [
        ...(Array.isArray(receiptsData)
          ? receiptsData.map((r) => ({
              kind: "receipt" as const,
              id: r.id,
              name: r.vendor || "Unknown vendor",
              date: r.receipt_date,
              currency: r.currency,
              amount: r.total_amount,
              status: r.status,
              created_at: r.created_at,
              ref: "",
            }))
          : []),
        ...(Array.isArray(invoicesData)
          ? invoicesData.map((inv) => ({
              kind: "invoice" as const,
              id: inv.id,
              name: inv.client_name || "Unknown client",
              date: inv.invoice_date,
              currency: inv.currency,
              amount: inv.total_amount,
              status: `${inv.workflow_status} • ${inv.payment_status}`,
              created_at: inv.created_at,
              ref: inv.invoice_number || "",
            }))
          : []),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));

      setItems(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    function onCompanyChanged() {
      void load();
      setAuditFor(null);
      setAudit([]);
    }
    window.addEventListener("ledgerly:companyChanged", onCompanyChanged);
    return () => window.removeEventListener("ledgerly:companyChanged", onCompanyChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  async function loadAudit(target: { kind: "receipt" | "invoice"; id: string }) {
    if (!token) return;
    setAuditFor(target);
    setAudit([]);
    setAuditLoading(true);
    try {
      const res = await fetch(`${apiUrl}/${target.kind === "receipt" ? "receipts" : "invoices"}/${target.id}/audit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as AuditEvent[] | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Failed to load audit.");
      setAudit(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit.");
    } finally {
      setAuditLoading(false);
    }
  }

  const filtered = items.filter((it) => {
    if (kind !== "all" && it.kind !== kind) return false;
    if (status !== "all" && !it.status.toLowerCase().includes(status.toLowerCase())) return false;

    const hay = `${it.name} ${it.ref} ${it.status}`.toLowerCase();
    if (q.trim() && !hay.includes(q.trim().toLowerCase())) return false;

    const created = it.created_at.slice(0, 10);
    if (dateFrom && created < dateFrom) return false;
    if (dateTo && created > dateTo) return false;
    return true;
  });

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Search receipts and invoices, then inspect audit events.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 lg:grid-cols-12 lg:items-end">
        <label className="block text-sm lg:col-span-5">
          <span className="text-zinc-600 dark:text-zinc-300">Query</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Vendor/client, status, invoice #…"
            className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
          />
        </label>
        <label className="block text-sm lg:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-300">Type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
          >
            <option value="all">All</option>
            <option value="receipt">Receipts</option>
            <option value="invoice">Invoices</option>
          </select>
        </label>
        <label className="block text-sm lg:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-300">Status contains</span>
          <input
            value={status === "all" ? "" : status}
            onChange={(e) => setStatus(e.target.value ? e.target.value : "all")}
            placeholder="needs_review"
            className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
          />
        </label>
        <label className="block text-sm lg:col-span-3">
          <span className="text-zinc-600 dark:text-zinc-300">Created date</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="block h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="block h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
            />
          </div>
        </label>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-black">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300">
              {loading ? "Loading…" : "No results."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                  <tr>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Ref</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/10">
                  {filtered.map((it) => (
                    <tr key={`${it.kind}:${it.id}`} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                          {it.kind}
                        </span>
                      </td>
                      <td className="px-4 py-3">{it.name}</td>
                      <td className="px-4 py-3">{it.ref || "—"}</td>
                      <td className="px-4 py-3">{formatMoney(it.currency, it.amount)}</td>
                      <td className="px-4 py-3">{it.status}</td>
                      <td className="px-4 py-3">
                        {new Date(it.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href={
                              it.kind === "receipt"
                                ? `/app/inbox/${it.id}`
                                : `/app/invoices/${it.id}`
                            }
                            className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                          >
                            Open
                          </Link>
                          <button
                            onClick={() => void loadAudit({ kind: it.kind, id: it.id })}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                          >
                            Audit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Audit peek</div>
          <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
            {auditFor ? `${auditFor.kind} ${auditFor.id}` : "Select an item."}
          </div>

          <div className="mt-4 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
            {auditLoading ? (
              <div className="text-zinc-600 dark:text-zinc-400">Loading…</div>
            ) : audit.length === 0 ? (
              <div className="text-zinc-600 dark:text-zinc-400">No events.</div>
            ) : (
              audit.slice(0, 8).map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-black/10 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-zinc-950 dark:text-zinc-50">{e.action}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(e.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    {e.actor || "system"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
