const KEY = "ct_token", MODE = "ct_mode";
const ok = () => typeof window !== "undefined";
export const getToken = () => (ok() ? localStorage.getItem(KEY) : null);
export const setToken = (t: string | null) => { if (!ok()) return; t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); };
export const isDemo = () => ok() && localStorage.getItem(MODE) === "demo";
export const setDemo = (on: boolean) => { if (!ok()) return; on ? localStorage.setItem(MODE, "demo") : localStorage.removeItem(MODE); };
