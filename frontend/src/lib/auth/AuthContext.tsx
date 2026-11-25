"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth as authApi } from "@/lib/services";
import { clearCache } from "@/lib/hooks";
import { isDemo, setDemo, setToken } from "@/lib/auth/token";
import type { User } from "@/lib/types";

type Ctx = {
  user: User | null;
  demo: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (
    email: string,
    password: string,
    full_name?: string,
    district_id?: number | null
  ) => Promise<User & { access_token?: string; verification_notice?: string; smtp_configured?: boolean }>;
  bootstrapAdmin: (email: string, password: string, full_name?: string) => Promise<User>;
  refreshUser: () => Promise<User | null>;
  enterDemo: () => void;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);
const DEMO_USER: User = {
  id: 0,
  email: "demo@local",
  full_name: "Demo visitor",
  role: "user",
  is_active: true,
  notification_prefs: { district_alerts: true, incident_updates: true, public_safety: true },
  privacy_prefs: { share_approximate_only: false },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [demo, setDemoState] = useState(false);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    clearCache();
    setToken(null);
    setDemo(false);
    setUser(null);
    setDemoState(false);
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (isDemo()) {
      setDemoState(true);
      setUser(DEMO_USER);
      return DEMO_USER;
    }
    try {
      const me = await authApi.me();
      setDemoState(false);
      setUser(me);
      return me;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (isDemo()) {
        setUser(DEMO_USER);
        setDemoState(true);
      } else {
        try {
          const me = await authApi.me();
          setUser(me);
        } catch {
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    })();
    const onUnauth = () => {
      if (!isDemo()) setUser(null);
    };
    window.addEventListener("ct:unauthorized", onUnauth);
    return () => window.removeEventListener("ct:unauthorized", onUnauth);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    clearCache();
    setDemo(false);
    setDemoState(false);
    setToken(res.access_token);
    const me = res.user ?? (await authApi.me());
    setUser(me);
    return me;
  }, []);

  const register = useCallback(
    async (email: string, password: string, full_name?: string, district_id?: number | null) => {
      const res = await authApi.register(email, password, full_name, district_id);
      clearCache();
      setDemo(false);
      setDemoState(false);
      setToken(res.access_token ?? null);
      setUser(res);
      return res;
    },
    []
  );

  const bootstrapAdmin = useCallback(async (email: string, password: string, full_name?: string) => {
    const res = await authApi.bootstrapAdmin({ email, password, full_name });
    clearCache();
    setDemo(false);
    setDemoState(false);
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const enterDemo = useCallback(() => {
    clearCache();
    setToken(null);
    setDemo(true);
    setDemoState(true);
    setUser(DEMO_USER);
  }, []);

  const value = useMemo(
    () => ({ user, demo, loading, login, register, bootstrapAdmin, refreshUser, enterDemo, logout }),
    [user, demo, loading, login, register, bootstrapAdmin, refreshUser, enterDemo, logout]
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
};
