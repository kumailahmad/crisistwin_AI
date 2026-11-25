// localStorage-backed store for demo mode. Everything here is computed in the browser and clearly labelled as demo.
function read<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } }
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
export const demoStore = {
  list: <T,>(k: string): T[] => (typeof window === "undefined" ? [] : read<T[]>(`ct_demo_${k}`, [])),
  add<T extends { id: number }>(k: string, item: Omit<T, "id">): T {
    const all = this.list<T>(k); const row = { ...item, id: (all[0]?.id ?? 0) + 1 } as T; write(`ct_demo_${k}`, [row, ...all].slice(0, 100)); return row;
  },
};
