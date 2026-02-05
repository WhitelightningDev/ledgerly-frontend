import { loadFromLocalStorage, saveToLocalStorage, uuid } from "./localStore";

export type BatchStat = {
  id: string;
  company_id: string;
  created_at: string;
  source: "reconciliation" | "catch_up";
  action: "match_suggested_batch" | "post_batch";
  batch_size: number;
  page_index: number;
  applied: number; // matches applied or items posted
  succeeded: number;
  failed: number;
  notes?: string;
};

function key(companyId: string) {
  return `ledgerly:batchStats:${companyId}`;
}

export function listBatchStats(companyId: string): BatchStat[] {
  const rows = loadFromLocalStorage<BatchStat[]>(key(companyId), []);
  return Array.isArray(rows) ? rows : [];
}

export function addBatchStat(
  companyId: string,
  stat: Omit<BatchStat, "id" | "company_id" | "created_at">,
): BatchStat {
  const row: BatchStat = {
    id: uuid(),
    company_id: companyId,
    created_at: new Date().toISOString(),
    ...stat,
  };
  const rows = listBatchStats(companyId);
  rows.unshift(row);
  saveToLocalStorage(key(companyId), rows.slice(0, 200));
  return row;
}

