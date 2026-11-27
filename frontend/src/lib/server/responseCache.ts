import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export type CacheTag = "alerts" | "districts" | "boundaries" | "resources" | "incidents_public";

interface CachedPayload {
  body: string;
  etag: string;
  version: number;
  cachedAt: number;
}

const g = globalThis as unknown as {
  __ctCacheVersions?: Record<CacheTag, number>;
  __ctResponseCache?: Map<string, CachedPayload>;
};

const VERSIONS: Record<CacheTag, number> = (g.__ctCacheVersions ??= {
  alerts: 1,
  districts: 1,
  boundaries: 1,
  resources: 1,
  incidents_public: 1,
});

const RESPONSE_CACHE: Map<string, CachedPayload> = (g.__ctResponseCache ??= new Map());
const MAX_CACHE_ENTRIES = 64;

export function getCacheVersion(tag: CacheTag): number {
  return VERSIONS[tag] ?? 1;
}

export function invalidateCache(...tags: CacheTag[]): void {
  for (const tag of tags) {
    VERSIONS[tag] = (VERSIONS[tag] ?? 1) + 1;
  }
  for (const key of Array.from(RESPONSE_CACHE.keys())) {
    if (tags.some((t) => key.startsWith(`${t}:`))) {
      RESPONSE_CACHE.delete(key);
    }
  }
  // Best-effort Next.js ISR cache invalidation when running inside Next server
  if (tags.includes("alerts")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { revalidatePath } = require("next/cache") as { revalidatePath?: (p: string) => void };
      revalidatePath?.("/");
      revalidatePath?.("/alerts");
    } catch {
      /* ignore when invoked outside Next request lifecycle (e.g., unit tests) */
    }
  }
}

export function computeEtag(body: string): string {
  const hash = crypto.createHash("sha1").update(body).digest("base64url").slice(0, 16);
  return `W/"${hash}"`;
}

export function cachedPublicJson<T>(
  req: NextRequest,
  opts: {
    tag: CacheTag;
    key: string;
    maxAge: number;
    sMaxAge: number;
    swr: number;
    compute: () => T;
  }
): NextResponse {
  const cacheKey = `${opts.tag}:${opts.key}`;
  const version = getCacheVersion(opts.tag);
  let entry = RESPONSE_CACHE.get(cacheKey);
  if (!entry || entry.version !== version) {
    const data = opts.compute();
    const body = JSON.stringify(data);
    entry = {
      body,
      etag: computeEtag(body),
      version,
      cachedAt: Date.now(),
    };
    if (RESPONSE_CACHE.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = RESPONSE_CACHE.keys().next().value;
      if (oldestKey) RESPONSE_CACHE.delete(oldestKey);
    }
    RESPONSE_CACHE.set(cacheKey, entry);
  }

  const cacheControl = `public, max-age=${opts.maxAge}, s-maxage=${opts.sMaxAge}, stale-while-revalidate=${opts.swr}`;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === entry.etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: entry.etag,
        "Cache-Control": cacheControl,
        Vary: "Authorization",
      },
    });
  }

  return new NextResponse(entry.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ETag: entry.etag,
      "Cache-Control": cacheControl,
      Vary: "Authorization",
    },
  });
}

export function noStoreJson(data: unknown, init: ResponseInit = {}): NextResponse {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  return res;
}
