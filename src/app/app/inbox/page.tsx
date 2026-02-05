"use client";

import { useRouter } from "next/navigation";
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

type Receipt = {
  id: string;
  company_id: string | null;
  status: string;
  vendor: string | null;
  receipt_date: string | null;
  currency: string;
  total_amount: number | null;
  uploaded_by: string | null;
  file_name: string | null;
  created_at: string;
};

const ALL_STATUSES = [
  "received",
  "needs_review",
  "approved",
  "posted",
  "rejected",
  "post_failed",
] as const;

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

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "needs_review"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : status === "approved"
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : status === "posted"
          ? "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300"
          : status === "rejected"
            ? "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
            : "border-black/10 bg-black/5 text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${cls}`}
    >
      {status}
    </span>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);

  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [extractingIds, setExtractingIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([
    "received",
    "needs_review",
  ]);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    void load();

    function onCompanyChanged() {
      setSelectedIds({});
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

      const params = new URLSearchParams();
      params.set("company_id", companyId);
      params.set("limit", "200");
      if (q) params.set("q", q);
      if (dateFrom) params.set("created_from", dateFrom);
      if (dateTo) params.set("created_to", dateTo);
      for (const s of selectedStatuses) params.append("status", s);

      const res = await fetch(`${apiUrl}/receipts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as Receipt[] | ApiError;
      if (!res.ok) {
        const message = !Array.isArray(data) ? data.detail : undefined;
        throw new Error(message || "Failed to load receipts.");
      }
      if (!Array.isArray(data)) throw new Error("Unexpected API response.");
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load receipts.");
    } finally {
      setLoading(false);
    }
  }

  async function extract(receiptId: string) {
    if (!token) return;
    setError(null);
    setExtractingIds((prev) => ({ ...prev, [receiptId]: true }));
    try {
      const res = await fetch(`${apiUrl}/receipts/${receiptId}/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as Receipt | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Extraction failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtractingIds((prev) => {
        const next = { ...prev };
        delete next[receiptId];
        return next;
      });
    }
  }

  const allVisibleSelected =
    items.length > 0 && items.every((r) => Boolean(selectedIds[r.id]));

  function toggleAllVisible(next: boolean) {
    const updated: Record<string, boolean> = { ...selectedIds };
    for (const r of items) updated[r.id] = next;
    setSelectedIds(updated);
  }

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Receipt inbox</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Upload receipts, extract fields, then send to review.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <button
            onClick={() => window.dispatchEvent(new Event("ledgerly:upload"))}
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Upload document
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="grid gap-3 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-4">
            <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Merchant
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search merchant…"
              className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
            />
          </div>

          <div className="lg:col-span-4">
            <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Status (multi-select)
            </div>
            <details className="relative mt-2">
              <summary className="list-none">
                <button
                  type="button"
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  <span className="truncate">
                    {selectedStatuses.length
                      ? selectedStatuses.join(", ")
                      : "All"}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">▾</span>
                </button>
              </summary>
              <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-black">
                <div className="p-2">
                  {ALL_STATUSES.map((s) => {
                    const checked = selectedStatuses.includes(s);
                    return (
                      <label
                        key={s}
                        className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-white/5"
                      >
                        <span>{s}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedStatuses((prev) =>
                              checked
                                ? prev.filter((x) => x !== s)
                                : [...prev, s],
                            );
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </details>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:col-span-3">
            <div>
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                From
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                To
              </div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
            </div>
          </div>

          <div className="lg:col-span-1">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            {selectedCount > 0 ? `${selectedCount} selected` : ""}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled
              className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-xs font-medium text-zinc-950 opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              title="Bulk actions coming soon"
            >
              Approve (later)
            </button>
            <button
              disabled
              className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-xs font-medium text-zinc-950 opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              title="Bulk actions coming soon"
            >
              Export (later)
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-black">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/5 text-xs font-medium text-zinc-600 dark:border-white/10 dark:text-zinc-300">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleAllVisible(e.target.checked)}
                  />
                </th>
                <th className="w-14 px-2 py-3"> </th>
                <th className="px-2 py-3">Merchant</th>
                <th className="px-2 py-3">Date</th>
                <th className="px-2 py-3">Total</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Uploaded by</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/10">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300"
                  >
                    No receipts found.
                  </td>
                </tr>
              ) : (
                items.map((r) => {
                  const thumbUrl =
                    token != null
                      ? `${apiUrl}/receipts/${r.id}/file?token=${encodeURIComponent(
                          token,
                        )}`
                      : "";
                  const merchant = r.vendor || "Unknown";
                  const receiptDate = r.receipt_date
                    ? new Date(r.receipt_date).toLocaleDateString()
                    : new Date(r.created_at).toLocaleDateString();
                  const createdAt = new Date(r.created_at).toLocaleString();
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/5"
                      onClick={() => router.push(`/app/inbox/${r.id}`)}
                    >
                      <td
                        className="w-10 px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(selectedIds[r.id])}
                          onChange={(e) =>
                            setSelectedIds((prev) => ({
                              ...prev,
                              [r.id]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="w-14 px-2 py-3">
                        <div className="h-10 w-10 overflow-hidden rounded-lg border border-black/10 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={r.file_name || "Receipt"}
                            src={thumbUrl}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="font-medium text-zinc-950 dark:text-zinc-50">
                          {merchant}
                        </div>
                        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {r.file_name || ""}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-zinc-700 dark:text-zinc-300">
                        {receiptDate}
                      </td>
                      <td className="px-2 py-3 text-zinc-700 dark:text-zinc-300">
                        {formatMoney(r.currency, r.total_amount)}
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-2 py-3 text-zinc-700 dark:text-zinc-300">
                        {r.uploaded_by || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                        {createdAt}
                      </td>
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.status === "received" ? (
                          <button
                            onClick={() => void extract(r.id)}
                            disabled={Boolean(extractingIds[r.id])}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                          >
                            {extractingIds[r.id] ? (
                              <span className="inline-flex items-center gap-2">
                                <Spinner />
                                Extracting…
                              </span>
                            ) : (
                              "Extract"
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => router.push(`/app/inbox/${r.id}`)}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                          >
                            Open
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 animate-spin text-white dark:text-black"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
