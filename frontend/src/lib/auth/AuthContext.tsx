"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth as authApi } from "@/lib/services";
import { clearCache } from "@/lib/hooks";
import { isGuestChosen, setDemo, setGuestChosen, setToken } from "@/lib/auth/token";
import type { User } from "@/lib/types";

type Ctx = {
  user: User | null;
  demo: boolean;
  guest: boolean;
  guestChosen: boolean;
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
  continueAsGuest: () => void;
  enterDemo: () => void;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [guestChosen, setGuestChosenState] = useState(false);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    clearCache();
    setToken(null);
    setDemo(false);
    setGuestChosen(false);
    setUser(null);
    setGuestChosenState(false);
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.session();
      if (res.user) {
        setUser(res.user);
        setGuestChosen(false);
        setGuestChosenState(false);
        return res.user;
      }
      setToken(null);
      setUser(null);
      return null;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Clear legacy browser-only demo flag if left behind from older versions
      setDemo(false);
      setGuestChosenState(isGuestChosen());
      try {
        const res = await authApi.session();
        if (res.user) {
          setUser(res.user);
        } else {
          setToken(null);
          setUser(null);
        }
      } catch {
        setToken(null);
        setUser(null);
      }
      setLoading(false);
    })();
    const onUnauth = () => {
      setUser(null);
    };
    window.addEventListener("ct:unauthorized", onUnauth);
    return () => window.removeEventListener("ct:unauthorized", onUnauth);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    clearCache();
    setDemo(false);
    setGuestChosen(false);
    setGuestChosenState(false);
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
      setGuestChosen(false);
      setGuestChosenState(false);
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
    setGuestChosen(false);
    setGuestChosenState(false);
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const continueAsGuest = useCallback(() => {
    setDemo(false);
    setToken(null);
    setGuestChosen(true);
    setGuestChosenState(true);
    setUser(null);
  }, []);

  const enterDemo = continueAsGuest;

  const value = useMemo(
    () => ({
      user,
      demo: false,
      guest: !user,
      guestChosen,
      loading,
      login,
      register,
      bootstrapAdmin,
      refreshUser,
      continueAsGuest,
      enterDemo,
      logout,
    }),
    [user, guestChosen, loading, login, register, bootstrapAdmin, refreshUser, continueAsGuest, enterDemo, logout]
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
};
