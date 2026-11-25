const MODE = "ct_mode";
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
