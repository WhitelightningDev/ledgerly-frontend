"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { findLearnedDefaults, upsertLearnedDefaults } from "../../_lib/learnedDefaults";
import { firstMatchingRule, loadRules, type Rule } from "../../_lib/rules";
import { getApiUrl } from "../../../_lib/apiUrl";

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

function isEmptyLike(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  return lower === "unknown" || lower === "unknown client" || lower === "—";
}

type Invoice = {
  id: string;
  company_id: string | null;
  uploaded_by: string | null;
  workflow_status: string;
  payment_status: string;
  client_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string;
  subtotal_amount?: number | null;
  total_amount: number | null;
  tax_amount: number | null;
  extraction_confidence: number | null;
  document_type?: string | null;
  notes?: string | null;
  line_items_json?: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
  sage_object_type: string | null;
  sage_object_id: string | null;
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

export default function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [currency, setCurrency] = useState("ZAR");
  const [subtotalAmount, setSubtotalAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [notes, setNotes] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [appliedRule, setAppliedRule] = useState<Rule | null>(null);
  const [ruleSuggestsAutoApprove, setRuleSuggestsAutoApprove] = useState(false);
  const [appliedDefaults, setAppliedDefaults] = useState(false);

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

      const [invRes, auditRes] = await Promise.all([
        fetch(`${apiUrl}/invoices/${invoiceId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/invoices/${invoiceId}/audit`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const invData = (await invRes.json()) as Invoice | ApiError;
      if (!invRes.ok) {
        throw new Error((invData as ApiError).detail || "Failed to load invoice.");
      }
      if (!("id" in invData)) throw new Error("Unexpected API response.");

      const auditData = (await auditRes.json()) as AuditEvent[] | ApiError;
      if (!auditRes.ok) {
        throw new Error(
          (auditData as ApiError).detail || "Failed to load audit log.",
        );
      }

      setInvoice(invData);
      setAudit(Array.isArray(auditData) ? auditData : []);
      setClientName(invData.client_name || "");
      setInvoiceNumber(invData.invoice_number || "");
      setInvoiceDate(invData.invoice_date ? invData.invoice_date.slice(0, 10) : "");
      setCurrency(invData.currency || "ZAR");
      setSubtotalAmount(
        invData.subtotal_amount == null ? "" : String(invData.subtotal_amount),
      );
      setTotalAmount(invData.total_amount?.toString() || "");
      setTaxAmount(invData.tax_amount?.toString() || "");
      setPaymentStatus(invData.payment_status || "unpaid");
      setNotes(invData.notes || "");
      setDocumentType(invData.document_type || "");

      if (
        companyId &&
        (invData.workflow_status === "received" ||
          invData.workflow_status === "needs_review")
      ) {
        setAppliedDefaults(false);
        const rules = loadRules(companyId);
        const match = firstMatchingRule({
          rules,
          appliesTo: "invoice",
          counterpartyName: invData.client_name ?? "",
        });
        if (match) {
          setAppliedRule(match);
          if (match.set_document_type && !(invData.document_type ?? "").trim()) {
            setDocumentType(match.set_document_type);
          }
          const total = invData.total_amount ?? null;
          setRuleSuggestsAutoApprove(
            match.auto_approve_max_total != null &&
              total != null &&
              total <= match.auto_approve_max_total,
          );
        } else {
          setAppliedRule(null);
          setRuleSuggestsAutoApprove(false);
        }

        const defaults = findLearnedDefaults({
          companyId,
          counterpartyName: invData.client_name ?? "",
        });
        if (defaults) {
          let applied = false;
          if (
            defaults.document_type &&
            isEmptyLike(invData.document_type) &&
            !(match?.set_document_type || "").trim()
          ) {
            setDocumentType(defaults.document_type);
            applied = true;
          }
          setAppliedDefaults(applied);
        } else {
          setAppliedDefaults(false);
        }
      } else {
        setAppliedRule(null);
        setRuleSuggestsAutoApprove(false);
        setAppliedDefaults(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice.");
      setInvoice(null);
      setAudit([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function extract() {
    if (!token) return;
    setError(null);
    setExtracting(true);
    try {
      const res = await fetch(`${apiUrl}/invoices/${invoiceId}/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as Invoice | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Extraction failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  async function approve() {
    const ok = await approveCore();
    if (ok && from === "approvals") router.push("/app/approvals");
  }

  async function approveCore(): Promise<boolean> {
    if (!token) return false;
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/invoices/${invoiceId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_name: clientName || null,
          invoice_number: invoiceNumber || null,
          invoice_date: invoiceDate || null,
          currency: currency || null,
          subtotal_amount: subtotalAmount ? Number(subtotalAmount) : null,
          total_amount: totalAmount ? Number(totalAmount) : null,
          tax_amount: taxAmount ? Number(taxAmount) : null,
          notes: notes || null,
          document_type: documentType || null,
          payment_status: paymentStatus || null,
        }),
      });
      const data = (await res.json()) as Invoice | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Approve failed.");
      await load();
      const companyId = getCompanyId();
      if (companyId && clientName.trim()) {
        upsertLearnedDefaults({
          companyId,
          counterpartyName: clientName,
          defaults: {
            document_type: documentType || undefined,
          },
        });
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed.");
      return false;
    }
  }

  async function reject() {
    const ok = await rejectCore();
    if (ok && from === "approvals") router.push("/app/approvals");
  }

  async function rejectCore(): Promise<boolean> {
    if (!token) return false;
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/invoices/${invoiceId}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: rejectReason || null }),
      });
      const data = (await res.json()) as Invoice | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Reject failed.");
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed.");
      return false;
    }
  }

  async function postToSageStub(): Promise<boolean> {
    if (!token) return false;
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as Invoice | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Post failed.");
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed.");
      return false;
    }
  }

  async function approveAndPost() {
    const ok = await approveCore();
    if (!ok) return;
    const posted = await postToSageStub();
    if (posted && from === "approvals") router.push("/app/approvals");
  }

  const fileUrl = token
    ? `${apiUrl}/invoices/${invoiceId}/file?token=${encodeURIComponent(token)}`
    : "#";

  const fileName = invoice?.file_name ?? "";
  const lowerFile = fileName.toLowerCase();
  const isPdf = lowerFile.endsWith(".pdf");
  const isImage =
    lowerFile.endsWith(".png") ||
    lowerFile.endsWith(".jpg") ||
    lowerFile.endsWith(".jpeg") ||
    lowerFile.endsWith(".webp");

  let lineItems: unknown = null;
  try {
    lineItems =
      invoice?.line_items_json != null ? JSON.parse(invoice.line_items_json) : null;
  } catch {
    lineItems = null;
  }

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Invoice details
            </h1>
            {invoice ? (
              <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                {invoice.workflow_status} • {invoice.payment_status}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Review extracted fields, approve, then post to Sage.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={from === "approvals" ? "/app/approvals" : "/app/invoices"}
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Back
          </Link>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          {invoice?.workflow_status === "received" ? (
            <button
              onClick={() => void extract()}
              disabled={extracting}
              className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {extracting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Extracting…
                </span>
              ) : (
                "Extract"
              )}
            </button>
          ) : null}
          <button
            onClick={() => void approve()}
            disabled={
              !invoice ||
              invoice.workflow_status === "posted" ||
              invoice.workflow_status === "rejected"
            }
            className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
          >
            Approve
          </button>
          <button
            onClick={() => void approveAndPost()}
            disabled={
              extracting ||
              !invoice ||
              invoice.workflow_status === "posted" ||
              invoice.workflow_status === "rejected"
            }
            className="inline-flex h-10 items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            Approve & post
          </button>
          <button
            onClick={() => void postToSageStub()}
            disabled={!invoice || invoice.workflow_status !== "approved"}
            className="inline-flex h-10 items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            Post to Sage
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {appliedRule ? (
        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <div className="font-medium">Rule applied</div>
          <div className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
            Matched “{appliedRule.match_value}”.{" "}
            {ruleSuggestsAutoApprove ? "Eligible for auto-approve." : null}
          </div>
          {ruleSuggestsAutoApprove && invoice?.workflow_status === "needs_review" ? (
            <div className="mt-3">
              <button
                onClick={() => void approve()}
                className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-600 px-4 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
              >
                Approve (rule)
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {appliedDefaults ? (
        <div className="mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <div className="font-medium">Suggested from past approvals</div>
          <div className="mt-1 text-xs text-blue-800/80 dark:text-blue-200/80">
            Defaults filled in based on previous approvals for this client.
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Invoice file
            </div>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              Open file
            </a>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-black/10 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
            {isPdf ? (
              <iframe
                title="Invoice PDF preview"
                src={fileUrl}
                className="h-[75vh] w-full"
              />
            ) : isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={invoice?.file_name || "Invoice"}
                src={fileUrl}
                className="h-auto w-full object-contain"
              />
            ) : (
              <div className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                Preview not available. Use “Open file”.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Fields
          </div>
          <div className="mt-5 grid gap-4">
            <label className="block text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Client</span>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">
                  Invoice #
                </span>
                <input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">
                  Invoice date
                </span>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Currency</span>
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Subtotal</span>
                <input
                  value={subtotalAmount}
                  onChange={(e) => setSubtotalAmount(e.target.value)}
                  inputMode="decimal"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Total</span>
                <input
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  inputMode="decimal"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Tax</span>
                <input
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                  inputMode="decimal"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">
                  Document type
                </span>
                <input
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  placeholder="invoice / receipt"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Notes</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">
                Payment status
              </span>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              >
                <option value="unpaid">unpaid</option>
                <option value="paid">paid</option>
              </select>
            </label>

            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="text-sm font-medium text-red-700 dark:text-red-300">
                Reject
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="h-11 w-full rounded-xl border border-red-500/20 bg-white px-4 text-sm text-zinc-950 outline-none dark:bg-black dark:text-zinc-50"
                />
                <button
                  onClick={() => void reject()}
                  disabled={!invoice || invoice.workflow_status === "posted"}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-red-600 px-5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-black/10 bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  Amount:{" "}
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">
                    {invoice ? formatMoney(invoice.currency, invoice.total_amount) : "—"}
                  </span>
                </div>
                <div>
                  Confidence:{" "}
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">
                    {invoice?.extraction_confidence != null
                      ? `${Math.round(invoice.extraction_confidence * 100)}%`
                      : "—"}
                  </span>
                </div>
              </div>
              {invoice?.subtotal_amount != null ? (
                <div className="mt-2">
                  Subtotal:{" "}
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">
                    {formatMoney(invoice.currency, invoice.subtotal_amount)}
                  </span>
                </div>
              ) : null}
              {invoice?.notes ? <div className="mt-2">{invoice.notes}</div> : null}
              {invoice?.sage_object_id ? (
                <div className="mt-2">
                  Sage: {invoice.sage_object_type} {invoice.sage_object_id}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Audit log
          </div>
          <Link
            href="/app/reports"
            className="text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            View reports
          </Link>
        </div>
        {audit.length === 0 ? (
          <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
            No audit events yet.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {audit.map((e) => (
              <li key={e.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">{e.action}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  {e.actor || "system"}
                </div>
                {e.details_json ? (
                  <pre className="mt-2 overflow-auto rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                    {e.details_json}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {Array.isArray(lineItems) && lineItems.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Line items
          </div>
          <pre className="mt-4 overflow-auto rounded-xl border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            {JSON.stringify(lineItems, null, 2)}
          </pre>
        </div>
      ) : null}
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
