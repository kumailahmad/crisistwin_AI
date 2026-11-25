"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth as authApi } from "@/lib/services";
import { clearCache } from "@/lib/hooks";
import { getToken, isDemo, setDemo, setToken } from "@/lib/auth/token";
import type { User } from "@/lib/types";

type Ctx = {
  user: User | null; demo: boolean; loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  enterDemo: () => void;
  logout: () => void;
};
const AuthCtx = createContext<Ctx | null>(null);
const DEMO_USER: User = { id: 0, email: "demo@local", full_name: "Demo visitor", role: "user", is_active: true };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [demo, setDemoState] = useState(false);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => { clearCache(); setToken(null); setDemo(false); setUser(null); setDemoState(false); }, []);

  useEffect(() => {
    (async () => {
      if (isDemo()) { setUser(DEMO_USER); setDemoState(true); }
      else if (getToken()) { try { setUser(await authApi.me()); } catch { setToken(null); } }
      setLoading(false);
    })();
    const onUnauth = () => { setUser(null); };
    window.addEventListener("ct:unauthorized", onUnauth);
    return () => window.removeEventListener("ct:unauthorized", onUnauth);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await authApi.login(email, password);
    clearCache(); setDemo(false); setDemoState(false); setToken(access_token);
    const me = await authApi.me(); setUser(me); return me;
  }, []);
  const enterDemo = useCallback(() => { clearCache(); setToken(null); setDemo(true); setDemoState(true); setUser(DEMO_USER); }, []);

  const value = useMemo(() => ({ user, demo, loading, login, enterDemo, logout }), [user, demo, loading, login, enterDemo, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error("AuthProvider missing"); return c; };
