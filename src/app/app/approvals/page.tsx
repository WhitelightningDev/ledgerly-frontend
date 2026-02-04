"use client";

import Link from "next/link";
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

type Receipt = {
  id: string;
  status: string;
  vendor: string | null;
  currency: string;
  total_amount: number | null;
  created_at: string;
};

type Invoice = {
  id: string;
  workflow_status: string;
  payment_status: string;
  client_name: string | null;
  currency: string;
  total_amount: number | null;
  created_at: string;
};

type QueueItem = {
  id: string;
  kind: "receipt" | "invoice";
  title: string;
  currency: string;
  amount: number | null;
  created_at: string;
  statusLabel: string;
};

type ApiError = { detail?: string };

function getCompanyId() {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem("ledgerly_company_id");
}

function formatMoney(currency: string, amount: number | null) {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function ApprovalsPage() {
  const router = useRouter();
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    void load();
    function onCompanyChanged() {
      void load();
    }
    window.addEventListener("ledgerly:companyChanged", onCompanyChanged);
    return () =>
      window.removeEventListener("ledgerly:companyChanged", onCompanyChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const companyId = getCompanyId();
      if (!companyId) {
        router.push("/onboarding");
        return;
      }

      const receiptsParams = new URLSearchParams({
        status: "needs_review",
        company_id: companyId,
        limit: "200",
      });
      const invoicesParams = new URLSearchParams({
        workflow_status: "needs_review",
        company_id: companyId,
        limit: "200",
      });

      const [receiptsRes, invoicesRes] = await Promise.all([
        fetch(`${apiUrl}/receipts?${receiptsParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/invoices?${invoicesParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const receiptsData = (await receiptsRes.json()) as Receipt[] | ApiError;
      if (!receiptsRes.ok) {
        const message = !Array.isArray(receiptsData)
          ? receiptsData.detail
          : undefined;
        throw new Error(message || "Failed to load receipts queue.");
      }
      if (!Array.isArray(receiptsData)) throw new Error("Unexpected receipts response.");

      const invoicesData = (await invoicesRes.json()) as Invoice[] | ApiError;
      if (!invoicesRes.ok) {
        const message = !Array.isArray(invoicesData)
          ? invoicesData.detail
          : undefined;
        throw new Error(message || "Failed to load invoices queue.");
      }
      if (!Array.isArray(invoicesData)) throw new Error("Unexpected invoices response.");

      const merged: QueueItem[] = [
        ...receiptsData.map((r) => ({
          id: r.id,
          kind: "receipt" as const,
          title: r.vendor || "Unknown vendor",
          currency: r.currency,
          amount: r.total_amount,
          created_at: r.created_at,
          statusLabel: r.status,
        })),
        ...invoicesData.map((inv) => ({
          id: inv.id,
          kind: "invoice" as const,
          title: inv.client_name || "Unknown client",
          currency: inv.currency,
          amount: inv.total_amount,
          created_at: inv.created_at,
          statusLabel: `${inv.workflow_status} • ${inv.payment_status}`,
        })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));

      setItems(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approval Queue</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Receipts (money out) and invoices (money in) that need review before
            posting to Sage.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-black">
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300">
            No items in the queue. Check the{" "}
            <Link href="/app/inbox" className="underline">
              inbox
            </Link>
            .
          </div>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {items.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {r.title}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    {new Date(r.created_at).toLocaleString()} •{" "}
                    {formatMoney(r.currency, r.amount)} • {r.kind}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                    {r.statusLabel}
                  </span>
                  <Link
                    href={
                      r.kind === "invoice"
                        ? `/app/invoices/${r.id}?from=approvals`
                        : `/app/inbox/${r.id}?from=approvals`
                    }
                    className="inline-flex h-10 items-center justify-center rounded-full bg-amber-600 px-5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
                  >
                    Review
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
