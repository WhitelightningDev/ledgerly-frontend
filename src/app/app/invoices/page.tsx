"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

type Invoice = {
  id: string;
  workflow_status: string;
  payment_status: string;
  client_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string;
  total_amount: number | null;
  created_at: string;
  uploaded_by: string | null;
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

function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
      {label}
    </span>
  );
}

export default function InvoicesPage() {
  const router = useRouter();
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);

  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [payment, setPayment] = useState<string>("all");
  const [workflow, setWorkflow] = useState<string>("all");

  const [showUpload, setShowUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

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

      const params = new URLSearchParams();
      params.set("company_id", companyId);
      params.set("limit", "200");
      if (q) params.set("q", q);
      if (payment !== "all") params.set("payment_status", payment);
      if (workflow !== "all") params.set("workflow_status", workflow);

      const res = await fetch(`${apiUrl}/invoices?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as Invoice[] | ApiError;
      if (!res.ok) {
        const message = !Array.isArray(data) ? data.detail : undefined;
        throw new Error(message || "Failed to load invoices.");
      }
      if (!Array.isArray(data)) throw new Error("Unexpected API response.");
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function onUpload(file: File) {
    if (!token) return;
    setUploading(true);
    setError(null);
    try {
      const companyId = getCompanyId();
      if (!companyId) {
        router.push("/onboarding");
        return;
      }

      const form = new FormData();
      form.append("file", file);
      form.append("company_id", companyId);
      const res = await fetch(`${apiUrl}/invoices`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = (await res.json()) as { id?: string } | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Upload failed.");
      setShowUpload(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Money in. Upload invoices, review extracted fields, and post to Sage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Upload invoice
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Client or invoice #"
            className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Payment</span>
          <select
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
          >
            <option value="all">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Workflow</span>
          <select
            value={workflow}
            onChange={(e) => setWorkflow(e.target.value)}
            className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
          >
            <option value="all">All</option>
            <option value="received">Received</option>
            <option value="needs_review">Needs review</option>
            <option value="approved">Approved</option>
            <option value="posted">Posted</option>
            <option value="rejected">Rejected</option>
            <option value="post_failed">Post failed</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => void load()}
          className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Apply filters
        </button>
        {q || payment !== "all" || workflow !== "all" ? (
          <button
            onClick={() => {
              setQ("");
              setPayment("all");
              setWorkflow("all");
              void load();
            }}
            className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Reset
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-black">
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300">
            {loading ? "Loading..." : "No invoices found."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                <tr>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Workflow</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {items.map((inv) => (
                  <tr
                    key={inv.id}
                    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/5"
                    onClick={() => router.push(`/app/invoices/${inv.id}`)}
                  >
                    <td className="px-4 py-3">
                      {inv.client_name || "Unknown client"}
                    </td>
                    <td className="px-4 py-3">{inv.invoice_number || "—"}</td>
                    <td className="px-4 py-3">
                      {inv.invoice_date
                        ? new Date(inv.invoice_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {formatMoney(inv.currency, inv.total_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill label={inv.payment_status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill label={inv.workflow_status} />
                    </td>
                    <td className="px-4 py-3">
                      {inv.uploaded_by || "—"}
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(inv.created_at).toLocaleString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showUpload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-black">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold tracking-tight">
                  Upload invoice
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  PDF, PNG, or JPG.
                </div>
              </div>
              <button
                onClick={() => setShowUpload(false)}
                className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                  e.currentTarget.value = "";
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                  e.currentTarget.value = "";
                }}
              />
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {uploading ? "Uploading..." : "Take photo"}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
              >
                {uploading ? "Uploading..." : "Choose file"}
              </button>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                After upload, open the invoice to run extraction and approve.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
