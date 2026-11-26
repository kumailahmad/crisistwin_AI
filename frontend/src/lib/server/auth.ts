import crypto from "crypto";
import type { NextRequest } from "next/server";

const SECRET = () => process.env.SECRET_KEY || "dev-only-change-me";
const TOKEN_MINUTES = () => Number(process.env.ACCESS_TOKEN_MINUTES || "60");
export const SESSION_COOKIE = "ct_session";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hex] = parts;
  const expected = Buffer.from(hex, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function generateOpaqueToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("hex");
}

const GUEST_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateGuestVerificationCode(length = 8): string {
  const buf = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += GUEST_CODE_ALPHABET[buf[i] % GUEST_CODE_ALPHABET.length];
  }
  return out;
}

export function hashOpaqueToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function verifyOpaqueSecret(raw: string, storedHexHash: string): boolean {
  if (!raw || !storedHexHash) return false;
  try {
    const actual = crypto.createHash("sha256").update(raw).digest();
    const expected = Buffer.from(storedHexHash, "hex");
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function b64u(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function createAccessToken(
  userId: number,
  role: string,
  email?: string,
  full_name?: string | null
): string {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64u(
    JSON.stringify({
      sub: String(userId),
      role,
      ...(email ? { email } : {}),
      ...(full_name ? { name: full_name } : {}),
      iat: now,
      exp: now + TOKEN_MINUTES() * 60,
    })
  );
  const sig = crypto.createHmac("sha256", SECRET()).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function decodeAccessToken(
  token: string
): { sub: number; role: string; email?: string; full_name?: string | null } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expected = crypto.createHmac("sha256", SECRET()).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(sig, "base64url");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      role?: string;
      email?: string;
      name?: string;
      exp?: number;
    };
    if (!data.sub || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    const sub = Number(data.sub);
    if (!Number.isFinite(sub)) return null;
    return {
      sub,
      role: data.role || "user",
      email: typeof data.email === "string" ? data.email : undefined,
      full_name: typeof data.name === "string" ? data.name : null,
    };
  } catch {
    return null;
  }
}

export function isHttpsRequest(req: NextRequest): boolean {
  const fwd = req.headers.get("x-forwarded-proto");
  if (fwd) return fwd.split(",")[0].trim().toLowerCase() === "https";
  return req.nextUrl.protocol === "https:";
}

export function sessionCookieConfig(req: NextRequest, clear = false) {
  const secure = isHttpsRequest(req);
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    partitioned: secure || undefined,
    path: "/",
    maxAge: clear ? 0 : TOKEN_MINUTES() * 60,
  };
}

/** Verify same-origin / non-simple request origin when authenticating mutating calls via cookies. */
export function verifyMutationOrigin(req: NextRequest): boolean {
  const rawHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const host = rawHost.split(",")[0].trim().toLowerCase();
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (host && originHost !== host) return false;
      return true;
    } catch {
      return false;
    }
  }
  const secFetch = req.headers.get("sec-fetch-site");
  if (secFetch && secFetch !== "same-origin" && secFetch !== "same-site" && secFetch !== "none") {
    return false;
  }
  return true;
}

const g = globalThis as unknown as {
  __ctLoginFails?: Map<string, number[]>;
  __ctAiHits?: Map<string | number, number[]>;
  __ctIncHits?: Map<string | number, number[]>;
  __ctFlagHits?: Map<string | number, number[]>;
  __ctTrackHits?: Map<string, number[]>;
};

const loginFails: Map<string, number[]> = (g.__ctLoginFails ??= new Map());
const aiHits: Map<string | number, number[]> = (g.__ctAiHits ??= new Map());
const incHits: Map<string | number, number[]> = (g.__ctIncHits ??= new Map());
const flagHits: Map<string | number, number[]> = (g.__ctFlagHits ??= new Map());
const trackHits: Map<string, number[]> = (g.__ctTrackHits ??= new Map());

export function loginBlocked(ip: string, email: string): boolean {
  const key = `${ip}|${email.trim().toLowerCase()}`;
  const cutoff = Date.now() - 5 * 60_000;
  const arr = (loginFails.get(key) ?? []).filter((t) => t > cutoff);
  loginFails.set(key, arr);
  return arr.length >= 5;
}

export function loginFailed(ip: string, email: string): void {
  const key = `${ip}|${email.trim().toLowerCase()}`;
  const cutoff = Date.now() - 5 * 60_000;
  const arr = (loginFails.get(key) ?? []).filter((t) => t > cutoff);
  arr.push(Date.now());
  loginFails.set(key, arr);
}

export function loginOk(ip: string, email: string): void {
  loginFails.delete(`${ip}|${email.trim().toLowerCase()}`);
}

export function aiRateOk(key: string | number, overrideLimit?: number): boolean {
  const limit = Math.max(1, overrideLimit ?? Number(process.env.AI_RATE_LIMIT_PER_MINUTE || "10"));
  const cutoff = Date.now() - 60_000;
  const arr = (aiHits.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= limit) {
    aiHits.set(key, arr);
    return false;
  }
  arr.push(Date.now());
  aiHits.set(key, arr);
  return true;
}

export function incidentRateOk(key: string | number): boolean {
  const cutoff = Date.now() - 3600_000;
  const arr = (incHits.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= 8) {
    incHits.set(key, arr);
    return false;
  }
  arr.push(Date.now());
  incHits.set(key, arr);
  return true;
}

export function flagRateOk(key: string | number): boolean {
  const cutoff = Date.now() - 3600_000;
  const arr = (flagHits.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= 12) {
    flagHits.set(key, arr);
    return false;
  }
  arr.push(Date.now());
  flagHits.set(key, arr);
  return true;
}

export function trackRateOk(ip: string): boolean {
  const cutoff = Date.now() - 5 * 60_000;
  const arr = (trackHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (arr.length >= 25) {
    trackHits.set(ip, arr);
    return false;
  }
  arr.push(Date.now());
  trackHits.set(ip, arr);
  return true;
}
