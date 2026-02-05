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

type Receipt = {
  id: string;
  status: string;
  vendor: string | null;
  receipt_date: string | null;
  currency: string;
  subtotal_amount?: number | null;
  total_amount: number | null;
  tax_amount: number | null;
  category_suggestion: string | null;
  tax_suggestion: string | null;
  payment_method?: string | null;
  document_type?: string | null;
  notes?: string | null;
  line_items_json?: string | null;
  extraction_confidence?: number | null;
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

type ApiError = { detail?: string };

function isEmptyLike(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  return lower === "unknown" || lower === "unknown vendor" || lower === "—";
}

export default function ReceiptDetailClient({
  receiptId,
}: {
  receiptId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vendor, setVendor] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [subtotalAmount, setSubtotalAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [category, setCategory] = useState("");
  const [taxTreatment, setTaxTreatment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [appliedRule, setAppliedRule] = useState<Rule | null>(null);
  const [ruleSuggestsAutoApprove, setRuleSuggestsAutoApprove] = useState(false);
  const [appliedDefaults, setAppliedDefaults] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [rRes, aRes] = await Promise.all([
        fetch(`${apiUrl}/receipts/${receiptId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/receipts/${receiptId}/audit`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const rData = (await rRes.json()) as Receipt | ApiError;
      if (!rRes.ok) {
        throw new Error((rData as ApiError).detail || "Failed to load receipt.");
      }
      if (!("id" in rData)) throw new Error("Unexpected API response.");

      const aData = (await aRes.json()) as AuditEvent[] | ApiError;
      if (!aRes.ok) {
        const message = !Array.isArray(aData) ? aData.detail : undefined;
        throw new Error(message || "Failed to load audit.");
      }
      if (!Array.isArray(aData)) throw new Error("Unexpected API response.");

      setReceipt(rData);
      setAudit(aData);

      setVendor(rData.vendor ?? "");
      setReceiptDate(rData.receipt_date ? rData.receipt_date.slice(0, 10) : "");
      setCurrency(rData.currency || "USD");
      setSubtotalAmount(
        rData.subtotal_amount == null ? "" : String(rData.subtotal_amount),
      );
      setTotalAmount(rData.total_amount == null ? "" : String(rData.total_amount));
      setTaxAmount(rData.tax_amount == null ? "" : String(rData.tax_amount));
      setCategory(rData.category_suggestion ?? "");
      setTaxTreatment(rData.tax_suggestion ?? "");
      setPaymentMethod(rData.payment_method ?? "");
      setNotes(rData.notes ?? "");
      setDocumentType(rData.document_type ?? "");

      // Apply first matching local rule when item is awaiting review.
      const companyId = getCompanyId();
      if (companyId && (rData.status === "received" || rData.status === "needs_review")) {
        setAppliedDefaults(false);

        const rules = loadRules(companyId);
        const match = firstMatchingRule({
          rules,
          appliesTo: "receipt",
          counterpartyName: rData.vendor ?? "",
        });
        setAppliedRule(match);
        const total = rData.total_amount ?? null;
        setRuleSuggestsAutoApprove(
          match?.auto_approve_max_total != null &&
            total != null &&
            total <= match.auto_approve_max_total,
        );

        // Rules win, then learned defaults fill gaps.
        if (match?.set_category && isEmptyLike(rData.category_suggestion)) {
          setCategory(match.set_category);
        }
        if (match?.set_tax_treatment && isEmptyLike(rData.tax_suggestion)) {
          setTaxTreatment(match.set_tax_treatment);
        }
        if (match?.set_payment_method && isEmptyLike(rData.payment_method)) {
          setPaymentMethod(match.set_payment_method);
        }
        if (match?.set_document_type && isEmptyLike(rData.document_type)) {
          setDocumentType(match.set_document_type);
        }

        const defaults = findLearnedDefaults({
          companyId,
          counterpartyName: rData.vendor ?? "",
        });
        if (defaults) {
          let applied = false;
          if (defaults.category && isEmptyLike(rData.category_suggestion) && !match?.set_category) {
            setCategory(defaults.category);
            applied = true;
          }
          if (defaults.tax_treatment && isEmptyLike(rData.tax_suggestion) && !match?.set_tax_treatment) {
            setTaxTreatment(defaults.tax_treatment);
            applied = true;
          }
          if (defaults.payment_method && isEmptyLike(rData.payment_method) && !match?.set_payment_method) {
            setPaymentMethod(defaults.payment_method);
            applied = true;
          }
          if (defaults.document_type && isEmptyLike(rData.document_type) && !match?.set_document_type) {
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
      setError(err instanceof Error ? err.message : "Failed to load receipt.");
    } finally {
      setLoading(false);
    }
  }

  async function extract() {
    if (!token) return;
    setError(null);
    setExtracting(true);
    try {
      const res = await fetch(`${apiUrl}/receipts/${receiptId}/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as Receipt | ApiError;
      if (!res.ok) {
        throw new Error((data as ApiError).detail || "Extraction failed.");
      }
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
      const res = await fetch(`${apiUrl}/receipts/${receiptId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vendor: vendor || null,
          receipt_date: receiptDate || null,
          currency: currency || null,
          subtotal_amount: subtotalAmount ? Number(subtotalAmount) : null,
          total_amount: totalAmount ? Number(totalAmount) : null,
          tax_amount: taxAmount ? Number(taxAmount) : null,
          category: category || null,
          tax_treatment: taxTreatment || null,
          payment_method: paymentMethod || null,
          notes: notes || null,
          document_type: documentType || null,
        }),
      });
      const data = (await res.json()) as Receipt | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Approve failed.");
      await load();
      const companyId = getCompanyId();
      if (companyId && vendor.trim()) {
        upsertLearnedDefaults({
          companyId,
          counterpartyName: vendor,
          defaults: {
            category: category || undefined,
            tax_treatment: taxTreatment || undefined,
            payment_method: paymentMethod || undefined,
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
      const res = await fetch(`${apiUrl}/receipts/${receiptId}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: rejectReason || null }),
      });
      const data = (await res.json()) as Receipt | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Reject failed.");
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed.");
      return false;
    }
  }

  async function approveAndPost() {
    const ok = await approveCore();
    if (!ok) return;
    const posted = await postToSageStub();
    if (posted && from === "approvals") router.push("/app/approvals");
  }

  async function postToSageStub(): Promise<boolean> {
    if (!token) return false;
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/receipts/${receiptId}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as Receipt | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Post failed.");
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed.");
      return false;
    }
  }

  const fileUrl =
    token != null
      ? `${apiUrl}/receipts/${receiptId}/file?token=${encodeURIComponent(token)}`
      : `${apiUrl}/receipts/${receiptId}/file`;

  const fileName = receipt?.file_name ?? "";
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
      receipt?.line_items_json != null ? JSON.parse(receipt.line_items_json) : null;
  } catch {
    lineItems = null;
  }

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Link
            href={from === "approvals" ? "/app/approvals" : "/app/inbox"}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {receipt?.vendor || "Receipt"}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Review extracted fields, approve, then post.
          </p>
          {receipt?.document_type ? (
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                {receipt.document_type}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          {receipt?.status === "received" ? (
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
              !receipt || receipt.status === "posted" || receipt.status === "rejected"
            }
            className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
          >
            Approve
          </button>
          <button
            onClick={() => void approveAndPost()}
            disabled={
              extracting ||
              !receipt ||
              receipt.status === "posted" ||
              receipt.status === "rejected"
            }
            className="inline-flex h-10 items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            Approve & post
          </button>
          <button
            onClick={() => void postToSageStub()}
            disabled={!receipt || receipt.status !== "approved"}
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
          {ruleSuggestsAutoApprove && receipt?.status === "needs_review" ? (
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
            Defaults filled in based on previous approvals for this vendor.
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Receipt / invoice
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
                title="Receipt PDF preview"
                src={fileUrl}
                className="h-[75vh] w-full"
              />
            ) : isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={receipt?.file_name || "Receipt"}
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
              <span className="text-zinc-600 dark:text-zinc-300">Vendor</span>
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Date</span>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Currency</span>
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>
            {receipt?.subtotal_amount != null || receipt?.extraction_confidence != null ? (
              <div className="rounded-xl border border-black/10 bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    Subtotal:{" "}
                    <span className="font-medium text-zinc-950 dark:text-zinc-50">
                      {receipt?.subtotal_amount == null
                        ? "—"
                        : `${receipt.subtotal_amount.toFixed(2)} ${receipt.currency}`}
                    </span>
                  </div>
                  <div>
                    Confidence:{" "}
                    <span className="font-medium text-zinc-950 dark:text-zinc-50">
                      {receipt?.extraction_confidence != null
                        ? `${Math.round(receipt.extraction_confidence * 100)}%`
                        : "—"}
                    </span>
                  </div>
                </div>
                {receipt?.notes ? (
                  <div className="mt-2 text-xs">{receipt.notes}</div>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Subtotal</span>
                <input
                  value={subtotalAmount}
                  onChange={(e) => setSubtotalAmount(e.target.value)}
                  inputMode="decimal"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
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
                <span className="text-zinc-600 dark:text-zinc-300">Category</span>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">
                  Tax treatment
                </span>
                <input
                  value={taxTreatment}
                  onChange={(e) => setTaxTreatment(e.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">
                  Payment method
                </span>
                <input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">
                  Document type
                </span>
                <input
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  placeholder="receipt / invoice"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-2 block w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
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
                  disabled={!receipt || receipt.status === "posted"}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-red-600 px-5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Audit log
        </div>
        <div className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {audit.length === 0 ? (
            <div className="text-zinc-600 dark:text-zinc-400">No events yet.</div>
          ) : (
            audit.map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-black/10 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-zinc-950 dark:text-zinc-50">
                    {e.action}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  {e.actor || "system"}
                </div>
                {e.details_json ? (
                  <pre className="mt-2 overflow-auto rounded-lg bg-white p-2 text-xs text-zinc-700 dark:bg-black dark:text-zinc-300">
                    {e.details_json}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>
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
