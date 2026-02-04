import { loadFromLocalStorage, saveToLocalStorage, uuid } from "./localStore";

export type ContactKind = "client" | "supplier";

export type Contact = {
  id: string;
  kind: ContactKind;
  name: string;
  tax_id: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

function key(companyId: string) {
  return `ledgerly:contacts:${companyId}`;
}

export function loadContacts(companyId: string): Contact[] {
  return loadFromLocalStorage<Contact[]>(key(companyId), []);
}

export function saveContacts(companyId: string, contacts: Contact[]): void {
  saveToLocalStorage(key(companyId), contacts);
}

export function createBlankContact(kind: ContactKind): Contact {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    kind,
    name: "",
    tax_id: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    created_at: now,
    updated_at: now,
  };
}

