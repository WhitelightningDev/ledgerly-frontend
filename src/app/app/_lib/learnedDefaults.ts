import { loadFromLocalStorage, saveToLocalStorage } from "./localStore";

export type LearnedDefaults = {
  category?: string;
  tax_treatment?: string;
  payment_method?: string;
  document_type?: string;
  updated_at: string;
};

export type LearnedDefaultsMap = Record<string, LearnedDefaults>;

function key(companyId: string) {
  return `ledgerly:learnedDefaults:${companyId}`;
}

export function normalizeCounterparty(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function loadLearnedDefaults(companyId: string): LearnedDefaultsMap {
  return loadFromLocalStorage<LearnedDefaultsMap>(key(companyId), {});
}

export function saveLearnedDefaults(companyId: string, map: LearnedDefaultsMap): void {
  saveToLocalStorage(key(companyId), map);
}

export function upsertLearnedDefaults(args: {
  companyId: string;
  counterpartyName: string;
  defaults: Omit<LearnedDefaults, "updated_at">;
}): void {
  const normalized = normalizeCounterparty(args.counterpartyName);
  if (!normalized) return;

  const map = loadLearnedDefaults(args.companyId);
  const now = new Date().toISOString();
  map[normalized] = {
    ...(map[normalized] || { updated_at: now }),
    ...args.defaults,
    updated_at: now,
  };
  saveLearnedDefaults(args.companyId, map);
}

export function findLearnedDefaults(args: {
  companyId: string;
  counterpartyName: string;
}): LearnedDefaults | null {
  const name = normalizeCounterparty(args.counterpartyName);
  if (!name) return null;
  const map = loadLearnedDefaults(args.companyId);

  if (map[name]) return map[name]!;

  // Fuzzy: choose the longest key that is contained in the name.
  let bestKey: string | null = null;
  for (const k of Object.keys(map)) {
    if (!k) continue;
    if (name.includes(k) && (bestKey == null || k.length > bestKey.length)) {
      bestKey = k;
    }
  }
  return bestKey ? map[bestKey] ?? null : null;
}

