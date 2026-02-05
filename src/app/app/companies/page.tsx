"use client";

import { useEffect, useMemo, useState } from "react";

import { loadCompanyProfile, saveCompanyProfile } from "../_lib/companyProfile";
import { createBlankContact, loadContacts, saveContacts, type Contact } from "../_lib/contacts";

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

type Company = { id: string; name: string; industry: string | null };

export default function CompaniesPage() {
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profileCompanyId, setProfileCompanyId] = useState<string>("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [defaultTaxTreatment, setDefaultTaxTreatment] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactKind, setContactKind] = useState<"supplier" | "client">("supplier");
  const [contactDraft, setContactDraft] = useState<Contact>(createBlankContact("supplier"));

  useEffect(() => {
    const companyId = getCompanyId() ?? "";
    setProfileCompanyId(companyId);
  }, []);

  useEffect(() => {
    if (!profileCompanyId) return;
    const p = loadCompanyProfile(profileCompanyId);
    setLegalName(p.legal_name);
    setTaxId(p.tax_id);
    setDefaultCurrency(p.default_currency || "USD");
    setDefaultTaxTreatment(p.default_tax_treatment);
    setPaymentTermsDays(p.payment_terms_days == null ? "" : String(p.payment_terms_days));
    setContacts(loadContacts(profileCompanyId));
    setError(null);
  }, [profileCompanyId]);

  useEffect(() => {
    setContactDraft(createBlankContact(contactKind));
  }, [contactKind]);

  async function loadCompanies() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as Company[] | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Failed to load companies.");
      if (!Array.isArray(data)) throw new Error("Unexpected API response.");
      setCompanies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load companies.");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  function saveProfile() {
    if (!profileCompanyId) return;
    saveCompanyProfile(profileCompanyId, {
      company_id: profileCompanyId,
      legal_name: legalName,
      tax_id: taxId,
      default_currency: defaultCurrency || "USD",
      default_tax_treatment: defaultTaxTreatment,
      payment_terms_days: paymentTermsDays ? Number(paymentTermsDays) : null,
    });
  }

  function saveContactsNow(next: Contact[]) {
    if (!profileCompanyId) return;
    setContacts(next);
    saveContacts(profileCompanyId, next);
  }

  function addContact() {
    if (!profileCompanyId) return;
    const now = new Date().toISOString();
    const c: Contact = {
      ...contactDraft,
      kind: contactKind,
      name: contactDraft.name.trim(),
      updated_at: now,
    };
    if (!c.name) return;
    saveContactsNow([c, ...contacts]);
    setContactDraft(createBlankContact(contactKind));
  }

  function removeContact(id: string) {
    saveContactsNow(contacts.filter((c) => c.id !== id));
  }

  const selectedCompany =
    companies.find((c) => c.id === profileCompanyId) ??
    (profileCompanyId ? { id: profileCompanyId, name: "Selected company", industry: null } : null);

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Company & contacts</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Store supplier/client contacts and per-company defaults. (Saved locally for now.)
          </p>
        </div>
        <button
          onClick={() => void loadCompanies()}
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Company profile</div>
          <div className="mt-5 grid gap-4">
            <label className="block text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Company</span>
              <select
                value={profileCompanyId}
                onChange={(e) => setProfileCompanyId(e.target.value)}
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              >
                {!profileCompanyId ? <option value="">Select company…</option> : null}
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Legal name</span>
                <input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder={selectedCompany?.name ?? "Company"}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">ABN / VAT ID</span>
                <input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="e.g. VAT123…"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Default currency</span>
                <input
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Payment terms (days)</span>
                <input
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(e.target.value)}
                  inputMode="numeric"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">
                Default tax rule (free text)
              </span>
              <input
                value={defaultTaxTreatment}
                onChange={(e) => setDefaultTaxTreatment(e.target.value)}
                placeholder="e.g. VAT inclusive / exempt / standard rate"
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
            </label>

            <div className="flex justify-end">
              <button
                onClick={saveProfile}
                disabled={!profileCompanyId}
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Save profile
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Contacts</div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {profileCompanyId ? `${contacts.length} saved` : "Select a company"}
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Type</span>
                <select
                  value={contactKind}
                  onChange={(e) => setContactKind(e.target.value as "supplier" | "client")}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                >
                  <option value="supplier">Supplier</option>
                  <option value="client">Client</option>
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-zinc-600 dark:text-zinc-300">Name</span>
                <input
                  value={contactDraft.name}
                  onChange={(e) => setContactDraft({ ...contactDraft, name: e.target.value })}
                  placeholder="Woolworths / ACME Client"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Email</span>
                <input
                  value={contactDraft.email}
                  onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Phone</span>
                <input
                  value={contactDraft.phone}
                  onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">ABN / VAT ID</span>
                <input
                  value={contactDraft.tax_id}
                  onChange={(e) => setContactDraft({ ...contactDraft, tax_id: e.target.value })}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Address</span>
                <input
                  value={contactDraft.address}
                  onChange={(e) => setContactDraft({ ...contactDraft, address: e.target.value })}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                onClick={addContact}
                disabled={!profileCompanyId || contactDraft.name.trim().length < 2}
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Add contact
              </button>
            </div>

            <div className="mt-2 overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
              {contacts.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-600 dark:text-zinc-300">
                  No contacts yet.
                </div>
              ) : (
                <ul className="divide-y divide-black/5 bg-white dark:divide-white/10 dark:bg-black">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                          {c.name}{" "}
                          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                            • {c.kind}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                          {c.email || "—"} • {c.phone || "—"} • {c.tax_id || "—"}
                        </div>
                      </div>
                      <button
                        onClick={() => removeContact(c.id)}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 px-4 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:text-red-300"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
