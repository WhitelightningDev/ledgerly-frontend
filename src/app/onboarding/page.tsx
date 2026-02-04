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

type ApiError = { detail?: string };

type Company = { id: string; name: string; industry: string | null };

type Role = "admin" | "submitter" | "bookkeeper";

type InviteRow = { email: string; role: Role };

export default function OnboardingPage() {
  const router = useRouter();
  const apiUrl = useMemo(() => getApiUrl(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState<Company | null>(null);

  const [invites, setInvites] = useState<InviteRow[]>([
    { email: "", role: "submitter" },
  ]);

  const [uploadType, setUploadType] = useState<"receipt" | "invoice">("receipt");
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }
    const companyId =
      typeof window === "undefined"
        ? null
        : localStorage.getItem("ledgerly_company_id");
    if (companyId) {
      setCompany({ id: companyId, name: "", industry: null });
      setStep(4);
    }
  }, [router]);

  async function createCompany() {
    const token = getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/companies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: companyName,
          industry: industry || null,
        }),
      });
      const data = (await res.json()) as Company | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Create company failed.");
      if (!("id" in data)) throw new Error("Unexpected API response.");
      setCompany(data);
      localStorage.setItem("ledgerly_company_id", data.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create company failed.");
    } finally {
      setBusy(false);
    }
  }

  async function inviteTeam() {
    if (!company) {
      setStep(1);
      return;
    }
    const token = getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const cleaned = invites
      .map((i) => ({ email: i.email.trim(), role: i.role }))
      .filter((i) => i.email.length > 0);

    if (cleaned.length === 0) {
      setStep(3);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/companies/${company.id}/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invites: cleaned }),
      });
      const data = (await res.json()) as unknown | ApiError;
      if (!res.ok)
        throw new Error((data as ApiError).detail || "Invite team failed.");
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite team failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFirstDocument(file: File) {
    if (!company) {
      setStep(1);
      return;
    }
    const token = getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("company_id", company.id);
      const endpoint = uploadType === "invoice" ? "invoices" : "receipts";
      const res = await fetch(`${apiUrl}/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = (await res.json()) as { id?: string } | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Upload failed.");
      if (!("id" in data) || !data.id) throw new Error("Unexpected API response.");
      setUploadedDocumentId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Onboarding</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        Set up your company, invite your team, optionally connect Sage, then
        upload your first receipt.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        <StepPill active={step === 1} label="1. Company" />
        <StepPill active={step === 2} label="2. Invite" />
        <StepPill active={step === 3} label="3. Sage" />
        <StepPill active={step === 4} label="4. First document" />
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        {step === 1 ? (
          <div>
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Create company
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Name</span>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Industry</span>
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Construction, SaaS, Retail..."
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => void createCompany()}
                disabled={busy || companyName.trim().length < 2}
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {busy ? "Creating..." : "Continue"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Invite team (optional)
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Add teammates now or skip and invite later.
            </p>

            <div className="mt-5 space-y-3">
              {invites.map((row, idx) => (
                <div key={idx} className="grid gap-3 sm:grid-cols-5">
                  <input
                    value={row.email}
                    onChange={(e) => {
                      const next = [...invites];
                      next[idx] = { ...next[idx], email: e.target.value };
                      setInvites(next);
                    }}
                    placeholder="teammate@company.com"
                    className="h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white sm:col-span-3"
                  />
                  <select
                    value={row.role}
                    onChange={(e) => {
                      const next = [...invites];
                      next[idx] = { ...next[idx], role: e.target.value as Role };
                      setInvites(next);
                    }}
                    className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white sm:col-span-2"
                  >
                    <option value="submitter">submitter</option>
                    <option value="bookkeeper">bookkeeper</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              ))}
              <button
                onClick={() => setInvites([...invites, { email: "", role: "submitter" }])}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                + Add another invite
              </button>
            </div>

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <button
                onClick={() => setStep(1)}
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/5"
              >
                Back
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  Skip
                </button>
                <button
                  onClick={() => void inviteTeam()}
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {busy ? "Saving..." : "Continue"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Connect Sage (optional)
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              You can skip this step for now and connect later.
            </p>
            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <button
                onClick={() => setStep(2)}
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/5"
              >
                Back
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(4)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  Skip
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Connect (coming soon)
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              First upload
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Upload a receipt (money out) or invoice (money in). It will land in the correct list.
            </p>

            {uploadedDocumentId ? (
              <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                Uploaded. You can now review it in the app.
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <button
                onClick={() => setStep(3)}
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/5"
              >
                Back
              </button>
              <div className="flex gap-3">
                <select
                  value={uploadType}
                  onChange={(e) =>
                    setUploadType(e.target.value as "receipt" | "invoice")
                  }
                  className="h-11 rounded-full border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                >
                  <option value="receipt">Receipt</option>
                  <option value="invoice">Invoice</option>
                </select>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadFirstDocument(f);
                    e.currentTarget.value = "";
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadFirstDocument(f);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {busy ? "Uploading..." : "Take photo"}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  {busy ? "Uploading..." : "Choose file"}
                </button>
                <button
                  onClick={() =>
                    router.push(
                      uploadType === "invoice" ? "/app/invoices" : "/app/inbox",
                    )
                  }
                  disabled={!uploadedDocumentId}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Finish
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={[
        "rounded-full border px-4 py-2 text-center text-xs font-medium",
        active
          ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-black"
          : "border-black/10 bg-white text-zinc-700 dark:border-white/10 dark:bg-black dark:text-zinc-300",
      ].join(" ")}
    >
      {label}
    </div>
  );
}
