"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

type BreakdownItem = { name: string; total: number };

type FinancialSummary = {
  month_start: string;
  month_end: string;
  revenue_invoiced_total: number;
  revenue_paid_total: number;
  expenses_posted_total: number;
  profit_invoiced: number;
  profit_paid: number;
  revenue_by_client: BreakdownItem[];
  expenses_by_category: BreakdownItem[];
};

function formatMoney(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function yyyyMm(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

export default function ReportsPage() {
  const router = useRouter();
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);
  const [currency] = useState("USD");

  const [month, setMonth] = useState(() => yyyyMm(new Date()));
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextMonth?: string) {
    const t = token;
    if (!t) return;
    const companyId = getCompanyId();
    if (!companyId) {
      router.push("/onboarding");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ company_id: companyId });
      if (nextMonth) params.set("month", nextMonth);
      const res = await fetch(`${apiUrl}/stats/financial?${params.toString()}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = (await res.json()) as FinancialSummary | ApiError;
      if (!res.ok) {
        throw new Error((body as ApiError).detail || "Failed to load reports.");
      }
      if (!("revenue_invoiced_total" in body)) {
        throw new Error("Unexpected API response.");
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    void load(month);
    function onCompanyChanged() {
      void load(month);
    }
    window.addEventListener("ledgerly:companyChanged", onCompanyChanged);
    return () =>
      window.removeEventListener("ledgerly:companyChanged", onCompanyChanged);
  }, [apiUrl, month, router, token]);

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Monthly revenue, expenses, and profit. (MVP)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-600 dark:text-zinc-300">Month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                const next = e.target.value;
                setMonth(next);
                void load(next);
              }}
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
            />
          </label>
          <button
            onClick={() => void load(month)}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Revenue (invoiced)
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {data ? formatMoney(currency, data.revenue_invoiced_total) : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Revenue (paid)
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {data ? formatMoney(currency, data.revenue_paid_total) : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Expenses (posted)
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {data ? formatMoney(currency, data.expenses_posted_total) : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Profit (invoiced)
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {data ? formatMoney(currency, data.profit_invoiced) : "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            Profit (paid):{" "}
            <span className="font-medium text-zinc-950 dark:text-zinc-50">
              {data ? formatMoney(currency, data.profit_paid) : "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Revenue by client
          </div>
          {data && data.revenue_by_client.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {data.revenue_by_client.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between gap-4 rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/10"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 font-medium">
                    {formatMoney(currency, r.total)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
              No invoice data for this month yet.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Expenses by category
          </div>
          {data && data.expenses_by_category.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {data.expenses_by_category.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between gap-4 rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/10"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 font-medium">
                    {formatMoney(currency, r.total)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
              No posted receipt data for this month yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
