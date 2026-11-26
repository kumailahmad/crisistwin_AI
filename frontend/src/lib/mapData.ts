"use client";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAsync } from "@/lib/hooks";
import { districts as dApi, incidents as iApi, resources as rApi, risk as riskApi, type BoundaryOrigin } from "@/lib/services";
import type { District, Incident, Resource, RiskAssessment } from "@/lib/types";

/** Everything the map screens need, loaded in parallel. */
export function useMapData() {
  const { user, loading: authLoading } = useAuth();
  const q = useAsync(
    async () => {
      const [ds, res, ass, inc] = await Promise.all([
        dApi.list(),
        rApi.list().catch(() => [] as Resource[]),
        user ? riskApi.list().catch(() => [] as RiskAssessment[]) : Promise.resolve([] as RiskAssessment[]),
        iApi.public().catch(() => [] as Incident[]),
      ]);
      const b = await dApi.boundaries(ds);
      return { districts: ds, boundaries: b.fc, origin: b.origin as BoundaryOrigin, resources: res, assessments: ass, incidents: inc };
    },
    [authLoading, user?.id],
    user ? `mapdata-${user.id}` : "mapdata-guest"
  );
  const riskByName = useMemo(() => {
    const out: Record<string, string> = {};
    if (!q.data) return out;
    const names = new Map(q.data.districts.map((d) => [d.id, d.name]));
    // assessments arrive newest-first, so the first seen per district is the latest
    for (const a of q.data.assessments) { const n = names.get(a.district_id); if (n && !(n in out) && a.score !== null) out[n] = a.category; }
    return out;
  }, [q.data]);
  const byName = useMemo(() => new Map<string, District>((q.data?.districts ?? []).map((d) => [d.name, d])), [q.data]);
  return { ...q, riskByName, byName };
}
