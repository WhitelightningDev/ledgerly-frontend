import { loadFromLocalStorage, saveToLocalStorage } from "./localStore";

export type BankTxn = {
  id: string;
  // Primary date used for matching/filtering (usually transaction date).
  date: string;
  // Additional statement fields (optional).
  nr?: string | null;
  account?: string | null;
  posting_date?: string | null;
  transaction_date?: string | null;
  description: string;
  original_description?: string | null;
  parent_category?: string | null;
  statement_category?: string | null;
  amount: number;
  currency: string;
  money_in?: number | null;
  money_out?: number | null;
  fee?: number | null;
  balance?: number | null;

  // If the bank CSV direction was misread, user can flip.
  direction_override?: "money_in" | "money_out" | null;

  matched_kind: "receipt" | "invoice" | null;
  matched_id: string | null;

  // For statements with no doc to match: user can allocate manually (stored locally for now).
  allocated?: boolean;
  allocation_direction?: "money_in" | "money_out";
  allocation_category?: string;
  allocation_account_code?: string;
  allocation_tax_treatment?: string;
  allocation_notes?: string;
};

function key(companyId: string) {
  return `ledgerly:bankTxns:${companyId}`;
}

export function loadBankTxns(companyId: string): BankTxn[] {
  return loadFromLocalStorage<BankTxn[]>(key(companyId), []);
}

export function saveBankTxns(companyId: string, txns: BankTxn[]) {
  saveToLocalStorage(key(companyId), txns);
}
