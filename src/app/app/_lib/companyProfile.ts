import { loadFromLocalStorage, saveToLocalStorage } from "./localStore";

export type CompanyProfile = {
  company_id: string;
  legal_name: string;
  tax_id: string; // ABN/VAT/etc
  default_currency: string;
  default_tax_treatment: string;
  payment_terms_days: number | null;
};

function key(companyId: string) {
  return `ledgerly:companyProfile:${companyId}`;
}

export function loadCompanyProfile(companyId: string): CompanyProfile {
  return loadFromLocalStorage<CompanyProfile>(key(companyId), {
    company_id: companyId,
    legal_name: "",
    tax_id: "",
    default_currency: "USD",
    default_tax_treatment: "",
    payment_terms_days: 30,
  });
}

export function saveCompanyProfile(companyId: string, profile: CompanyProfile): void {
  saveToLocalStorage(key(companyId), profile);
}

