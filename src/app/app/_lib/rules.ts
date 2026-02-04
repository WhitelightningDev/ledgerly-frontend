import { loadFromLocalStorage, saveToLocalStorage, uuid } from "./localStore";

export type AppliesTo = "receipt" | "invoice" | "both";
export type MatchType = "contains" | "equals" | "regex";

export type Rule = {
  id: string;
  enabled: boolean;
  applies_to: AppliesTo;

  match_field: "counterparty_name";
  match_type: MatchType;
  match_value: string;

  set_category: string;
  set_tax_treatment: string;
  set_account_code: string;
  set_document_type: string;
  auto_approve_max_total: number | null;

  created_at: string;
  updated_at: string;
};

function key(companyId: string) {
  return `ledgerly:rules:${companyId}`;
}

export function loadRules(companyId: string): Rule[] {
  return loadFromLocalStorage<Rule[]>(key(companyId), []);
}

export function saveRules(companyId: string, rules: Rule[]): void {
  saveToLocalStorage(key(companyId), rules);
}

export function createBlankRule(): Rule {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    enabled: true,
    applies_to: "both",
    match_field: "counterparty_name",
    match_type: "contains",
    match_value: "",
    set_category: "",
    set_tax_treatment: "",
    set_account_code: "",
    set_document_type: "",
    auto_approve_max_total: null,
    created_at: now,
    updated_at: now,
  };
}

export function firstMatchingRule(args: {
  rules: Rule[];
  appliesTo: "receipt" | "invoice";
  counterpartyName: string;
}): Rule | null {
  const name = (args.counterpartyName || "").trim();
  if (!name) return null;

  for (const r of args.rules) {
    if (!r.enabled) continue;
    if (r.applies_to !== "both" && r.applies_to !== args.appliesTo) continue;
    if (r.match_field !== "counterparty_name") continue;

    const needle = (r.match_value || "").trim();
    if (!needle) continue;

    if (r.match_type === "contains") {
      if (name.toLowerCase().includes(needle.toLowerCase())) return r;
    } else if (r.match_type === "equals") {
      if (name.toLowerCase() === needle.toLowerCase()) return r;
    } else if (r.match_type === "regex") {
      try {
        const re = new RegExp(needle, "i");
        if (re.test(name)) return r;
      } catch {
        // ignore invalid regex
      }
    }
  }
  return null;
}

