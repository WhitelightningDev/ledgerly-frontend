import { withStore } from "./idb";
import { openScanDb, STORE_SCAN_SESSIONS } from "./scanDb";
import { loadFromLocalStorage, saveToLocalStorage, uuid } from "./localStore";

export type ScanSession = {
  id: string;
  company_id: string;
  created_at: string;
  day_key: string; // YYYY-MM-DD local date when session started
  title: string; // e.g. "Feb 3"
  last_capture_at: string;
};

function activeKey(companyId: string) {
  return `ledgerly:scanActiveSession:${companyId}`;
}

function formatTitle(dayKey: string) {
  try {
    const d = new Date(`${dayKey}T00:00:00`);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dayKey;
  }
}

function localDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function listScanSessions(companyId: string): Promise<ScanSession[]> {
  const db = await openScanDb();
  const all = await withStore({
    db,
    storeName: STORE_SCAN_SESSIONS,
    mode: "readonly",
    run: (s) => s.getAll(),
  });
  const filtered = (Array.isArray(all) ? all : []).filter(
    (s) => (s as ScanSession).company_id === companyId,
  ) as ScanSession[];
  filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return filtered;
}

export async function getScanSession(id: string): Promise<ScanSession | null> {
  const db = await openScanDb();
  const res = await withStore({
    db,
    storeName: STORE_SCAN_SESSIONS,
    mode: "readonly",
    run: (s) => s.get(id),
  });
  return (res as ScanSession) ?? null;
}

export async function putScanSession(session: ScanSession): Promise<void> {
  const db = await openScanDb();
  await withStore({
    db,
    storeName: STORE_SCAN_SESSIONS,
    mode: "readwrite",
    run: (s) => s.put(session),
  });
}

export async function deleteScanSession(id: string): Promise<void> {
  const db = await openScanDb();
  await withStore({
    db,
    storeName: STORE_SCAN_SESSIONS,
    mode: "readwrite",
    run: (s) => s.delete(id),
  });
}

export async function setActiveSession(companyId: string, sessionId: string) {
  saveToLocalStorage(activeKey(companyId), sessionId);
}

export function getActiveSession(companyId: string): string | null {
  return loadFromLocalStorage<string | null>(activeKey(companyId), null);
}

export async function getOrCreateActiveSession(args: {
  companyId: string;
  maxIdleMinutes?: number;
}): Promise<ScanSession> {
  const maxIdleMinutes = args.maxIdleMinutes ?? 120;
  const now = new Date();
  const dayKey = localDayKey(now);
  const activeId = getActiveSession(args.companyId);

  if (activeId) {
    const existing = await getScanSession(activeId);
    if (existing && existing.company_id === args.companyId) {
      const last = new Date(existing.last_capture_at).getTime();
      const idleMinutes = (now.getTime() - last) / (60 * 1000);
      if (existing.day_key === dayKey && idleMinutes <= maxIdleMinutes) {
        return existing;
      }
    }
  }

  const createdAt = now.toISOString();
  const session: ScanSession = {
    id: uuid(),
    company_id: args.companyId,
    created_at: createdAt,
    day_key: dayKey,
    title: formatTitle(dayKey),
    last_capture_at: createdAt,
  };
  await putScanSession(session);
  await setActiveSession(args.companyId, session.id);
  return session;
}

export async function touchSession(sessionId: string): Promise<void> {
  const s = await getScanSession(sessionId);
  if (!s) return;
  await putScanSession({ ...s, last_capture_at: new Date().toISOString() });
}

