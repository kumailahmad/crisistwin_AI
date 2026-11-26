const MODE = "ct_mode";
const GUEST_CHOICE = "ct_guest_choice";
const GUEST_RECEIPTS = "ct_guest_receipts";
const ok = () => typeof window !== "undefined";

// Keep session bearer token strictly in memory (never localStorage/sessionStorage).
// Primary web authentication uses HttpOnly; SameSite cookies set by /api/v1/auth/*.
let memoryToken: string | null = null;

export const getToken = () => memoryToken;
export const setToken = (t: string | null) => {
  memoryToken = t || null;
};
export const isDemo = () => ok() && localStorage.getItem(MODE) === "demo";
export const setDemo = (on: boolean) => {
  if (!ok()) return;
  if (on) localStorage.setItem(MODE, "demo");
  else localStorage.removeItem(MODE);
};

export const isGuestChosen = () => ok() && localStorage.getItem(GUEST_CHOICE) === "1";
export const setGuestChosen = (on: boolean) => {
  if (!ok()) return;
  if (on) localStorage.setItem(GUEST_CHOICE, "1");
  else localStorage.removeItem(GUEST_CHOICE);
};

export type GuestReceipt = {
  code: string;
  verification_code: string;
  type: string;
  district_name: string | null;
  created_at: string;
};

export function loadGuestReceipts(): GuestReceipt[] {
  if (!ok()) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_RECEIPTS) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (x): x is GuestReceipt =>
        Boolean(x && typeof x.code === "string" && typeof x.verification_code === "string")
    );
  } catch {
    return [];
  }
}

export function saveGuestReceipt(entry: GuestReceipt): GuestReceipt[] {
  const prev = loadGuestReceipts().filter((r) => r.code !== entry.code);
  const next = [entry, ...prev].slice(0, 12);
  if (ok()) {
    try {
      localStorage.setItem(GUEST_RECEIPTS, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  }
  return next;
}
