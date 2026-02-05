"use client";

import { useEffect, useState } from "react";

import { createBlankRule, loadRules, saveRules, type Rule } from "../_lib/rules";

function getCompanyId() {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem("ledgerly_company_id");
}

export default function RulesPage() {
  const initialCompanyId = getCompanyId() ?? "";
  const [companyId, setCompanyId] = useState(initialCompanyId);

  const [rules, setRules] = useState<Rule[]>(() =>
    initialCompanyId ? loadRules(initialCompanyId) : [],
  );
  const [draft, setDraft] = useState<Rule>(createBlankRule());

  useEffect(() => {
    function onCompanyChanged() {
      const nextCompanyId = getCompanyId() ?? "";
      setCompanyId(nextCompanyId);
      setRules(nextCompanyId ? loadRules(nextCompanyId) : []);
      setDraft(createBlankRule());
    }
    window.addEventListener("ledgerly:companyChanged", onCompanyChanged);
    return () => window.removeEventListener("ledgerly:companyChanged", onCompanyChanged);
  }, []);

  function persist(next: Rule[]) {
    setRules(next);
    if (!companyId) return;
    saveRules(companyId, next);
  }

  function addRule() {
    if (!companyId) return;
    const trimmed = draft.match_value.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const rule: Rule = { ...draft, match_value: trimmed, updated_at: now };
    persist([rule, ...rules]);
    setDraft(createBlankRule());
  }

  function removeRule(id: string) {
    persist(rules.filter((r) => r.id !== id));
  }

  function toggleEnabled(id: string) {
    const now = new Date().toISOString();
    persist(
      rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled, updated_at: now } : r)),
    );
  }

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rules & automation</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Create rules like “If vendor contains X → category Y / tax Z / auto-approve”.
          (Saved locally for now.)
        </p>
      </div>

      {!companyId ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            Select a company first to manage rules.
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">New rule</div>
          <div className="mt-5 grid gap-4">
            <label className="block text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Applies to</span>
              <select
                value={draft.applies_to}
                onChange={(e) => setDraft({ ...draft, applies_to: e.target.value as Rule["applies_to"] })}
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              >
                <option value="both">Receipts + invoices</option>
                <option value="receipt">Receipts (money out)</option>
                <option value="invoice">Invoices (money in)</option>
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Match</span>
                <select
                  value={draft.match_type}
                  onChange={(e) => setDraft({ ...draft, match_type: e.target.value as Rule["match_type"] })}
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="regex">regex</option>
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-zinc-600 dark:text-zinc-300">Vendor / client</span>
                <input
                  value={draft.match_value}
                  onChange={(e) => setDraft({ ...draft, match_value: e.target.value })}
                  placeholder="Woolworths"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Set category</span>
                <input
                  value={draft.set_category}
                  onChange={(e) => setDraft({ ...draft, set_category: e.target.value })}
                  placeholder="Office supplies / Fuel / Rent"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Set tax</span>
                <input
                  value={draft.set_tax_treatment}
                  onChange={(e) => setDraft({ ...draft, set_tax_treatment: e.target.value })}
                  placeholder="VAT inclusive / exempt"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Set account code</span>
                <input
                  value={draft.set_account_code}
                  onChange={(e) => setDraft({ ...draft, set_account_code: e.target.value })}
                  placeholder="e.g. 4500"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Set payment method</span>
                <input
                  value={draft.set_payment_method}
                  onChange={(e) => setDraft({ ...draft, set_payment_method: e.target.value })}
                  placeholder="Card / Cash"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Document type</span>
                <input
                  value={draft.set_document_type}
                  onChange={(e) => setDraft({ ...draft, set_document_type: e.target.value })}
                  placeholder="receipt / invoice"
                  className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Auto-approve if total ≤</span>
              <input
                value={draft.auto_approve_max_total == null ? "" : String(draft.auto_approve_max_total)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    auto_approve_max_total: e.target.value ? Number(e.target.value) : null,
                  })
                }
                inputMode="decimal"
                placeholder="e.g. 50"
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
            </label>

            <div className="flex justify-end">
              <button
                onClick={addRule}
                disabled={!companyId || draft.match_value.trim().length < 2}
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Add rule
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Rules</div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{rules.length}</span>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
            {rules.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300">
                No rules yet.
              </div>
            ) : (
              <ul className="divide-y divide-black/5 bg-white dark:divide-white/10 dark:bg-black">
                {rules.map((r) => (
                  <li key={r.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {r.enabled ? "Enabled" : "Disabled"} • {r.applies_to}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleEnabled(r.id)}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                        >
                          {r.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => removeRule(r.id)}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 px-4 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                      If counterparty {r.match_type} “{r.match_value}”
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                      {r.set_category ? <Pill label={`Category: ${r.set_category}`} /> : null}
                      {r.set_tax_treatment ? <Pill label={`Tax: ${r.set_tax_treatment}`} /> : null}
                      {r.set_account_code ? <Pill label={`Acct: ${r.set_account_code}`} /> : null}
                      {r.set_payment_method ? <Pill label={`Pay: ${r.set_payment_method}`} /> : null}
                      {r.set_document_type ? <Pill label={`Type: ${r.set_document_type}`} /> : null}
                      {r.auto_approve_max_total != null ? (
                        <Pill label={`Auto ≤ ${r.auto_approve_max_total}`} />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
      {label}
    </span>
  );
}
