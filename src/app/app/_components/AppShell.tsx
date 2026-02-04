"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

type Me = { user_id: string; email: string; name: string };

const navItems: Array<{ href: string; label: string }> = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/inbox", label: "Inbox" },
  { href: "/app/invoices", label: "Invoices" },
  { href: "/app/transactions", label: "Transactions" },
  { href: "/app/approvals", label: "Approvals" },
  { href: "/app/search", label: "Search" },
  { href: "/app/reconciliation", label: "Reconciliation" },
  { href: "/app/reports", label: "Reports" },
  { href: "/app/integrations", label: "Integrations" },
  { href: "/app/companies", label: "Company" },
  { href: "/app/rules", label: "Rules" },
  { href: "/app/settings", label: "Settings" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const apiUrl = useMemo(() => getApiUrl(), []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState<"receipt" | "invoice">("receipt");
  const [showMobileNav, setShowMobileNav] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/auth/login");
      return;
    }

    const savedCompanyId = localStorage.getItem("ledgerly_company_id") ?? "";
    setCompanyId(savedCompanyId);

    void (async () => {
      const [meRes, companiesRes] = await Promise.all([
        fetch(`${apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const meData = (await meRes.json()) as Me | ApiError;
      if (meRes.ok && "user_id" in meData) setMe(meData);

      const companiesData = (await companiesRes.json()) as Company[] | ApiError;
      if (companiesRes.ok && Array.isArray(companiesData)) {
        setCompanies(companiesData);

        if (!savedCompanyId && companiesData.length > 0) {
          const first = companiesData[0].id;
          localStorage.setItem("ledgerly_company_id", first);
          setCompanyId(first);
        }
      }
    })();
  }, [apiUrl, router]);

  useEffect(() => {
    function handler() {
      setShowUpload(true);
    }
    window.addEventListener("ledgerly:upload", handler);
    return () => window.removeEventListener("ledgerly:upload", handler);
  }, []);

  function logout() {
    localStorage.removeItem("ledgerly_access_token");
    localStorage.removeItem("ledgerly_company_id");
    router.replace("/auth/login");
  }

  function handlePickedFile(file: File) {
    if (uploadType === "invoice") void uploadInvoice(file);
    else void uploadReceipt(file);
  }

  async function uploadReceipt(file: File) {
    const token = getToken();
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    if (!companyId) {
      router.push("/onboarding");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (companyId) form.append("company_id", companyId);
      const res = await fetch(`${apiUrl}/receipts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = (await res.json()) as { id?: string } | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Upload failed.");
      router.push("/app/inbox");
    } finally {
      setUploading(false);
      setShowUpload(false);
    }
  }

  async function uploadInvoice(file: File) {
    const token = getToken();
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    if (!companyId) {
      router.push("/onboarding");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (companyId) form.append("company_id", companyId);
      const res = await fetch(`${apiUrl}/invoices`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = (await res.json()) as { id?: string } | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Upload failed.");
      router.push("/app/invoices");
    } finally {
      setUploading(false);
      setShowUpload(false);
    }
  }

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <div className="flex w-full">
        <aside className="hidden min-h-screen w-64 shrink-0 border-r border-black/5 bg-white px-2 py-6 dark:border-white/10 dark:bg-black md:block">
          <Link href="/app" className="px-2 text-base font-semibold tracking-tight">
            Ledgerly
          </Link>
          <nav className="mt-6 space-y-1">
            {navItems.map((item) => {
              const active =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "block rounded-xl px-2 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-black"
                      : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-zinc-50",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-screen w-full flex-col">
          <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
            <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 md:hidden">
                  <button
                    type="button"
                    onClick={() => setShowMobileNav(true)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                    aria-label="Open navigation"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                      <path
                        d="M4 6h16M4 12h16M4 18h16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <Link href="/app" className="text-sm font-semibold tracking-tight">
                    Ledgerly
                  </Link>
                </div>

                <div className="flex items-center gap-2">
                  <span className="hidden text-xs font-medium text-zinc-600 dark:text-zinc-300 sm:inline">
                    Company
                  </span>
                  <select
                    value={companyId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCompanyId(next);
                      localStorage.setItem("ledgerly_company_id", next);
                      window.dispatchEvent(new Event("ledgerly:companyChanged"));
                    }}
                    className="h-10 max-w-[220px] rounded-xl border border-black/10 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                  >
                    {companies.length === 0 ? (
                      <option value={companyId || ""}>
                        {companyId ? "Selected company" : "No company"}
                      </option>
                    ) : (
                      companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </select>

                  {companies.length === 0 ? (
                    <Link
                      href="/onboarding"
                      className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50 sm:inline"
                    >
                      Create company
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowUpload(true)}
                  disabled={uploading}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePickedFile(f);
                    e.currentTarget.value = "";
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePickedFile(f);
                    e.currentTarget.value = "";
                  }}
                />

                <details className="relative">
                  <summary className="list-none">
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                    >
                      {me ? me.email : "User"}
                    </button>
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-black">
                    <div className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300">
                      {me ? me.name : "Signed in"}
                      <div className="mt-1 truncate text-zinc-500 dark:text-zinc-400">
                        {me ? me.email : ""}
                      </div>
                    </div>
                    <div className="border-t border-black/5 p-2 dark:border-white/10">
                      <button
                        onClick={logout}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-zinc-50"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                </details>
              </div>
            </div>

            {selectedCompany ? (
              <div className="border-t border-black/5 px-4 py-2 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300 sm:px-6">
                {selectedCompany.name}
                {selectedCompany.industry ? ` • ${selectedCompany.industry}` : ""}
              </div>
            ) : null}
          </header>

          <div className="flex-1">{children}</div>
        </div>
      </div>

      {showMobileNav ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowMobileNav(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[80vw] max-w-xs overflow-auto border-r border-black/10 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-black">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold tracking-tight">Ledgerly</div>
              <button
                onClick={() => setShowMobileNav(false)}
                className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Close
              </button>
            </div>

            <nav className="mt-4 space-y-1">
              {navItems.map((item) => {
                const active =
                  item.href === "/app"
                    ? pathname === "/app"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMobileNav(false)}
                    className={[
                      "block rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-zinc-950 text-white dark:bg-white dark:text-black"
                        : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-zinc-50",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 border-t border-black/10 pt-4 dark:border-white/10">
              <div className="text-xs text-zinc-600 dark:text-zinc-300">
                {me ? me.name : "Signed in"}
              </div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {me ? me.email : ""}
              </div>
              <button
                onClick={logout}
                className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/10 bg-white text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showUpload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold tracking-tight">
                  Upload document
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  Upload a receipt (expense) or invoice (income).
                </div>
              </div>
              <button
                onClick={() => setShowUpload(false)}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Type</span>
                <select
                  value={uploadType}
                  onChange={(e) =>
                    setUploadType(e.target.value as "receipt" | "invoice")
                  }
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                >
                  <option value="receipt">Receipt (money out)</option>
                  <option value="invoice">Invoice (money in)</option>
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {uploading ? "Uploading..." : "Take photo"}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  {uploading ? "Uploading..." : "Choose file"}
                </button>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                PDF or image. After upload, run extraction and approve.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
