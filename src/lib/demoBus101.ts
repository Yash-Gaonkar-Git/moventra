/**
 * Frontend-only bridge so the demo driver console (Bus 101) shows up on the
 * passenger map. The demo driver publishes its real device GPS through
 * BroadcastChannel + localStorage — exactly like the 102–110 simulation, no
 * Supabase write, no backend call of any kind.
 */
import type { ActiveBus, Bus, BusStop, Route, RouteProgress, StopProgress, StopStatus } from "@/lib/transit";
import { haversineKm } from "@/lib/transit";

export const DEMO_BUS_101_ID = "demo-101";
const STORAGE_KEY = "transittrack.demo101.fix";
const CHANNEL_NAME = "transittrack-demo-101";
/** A published fix older than this is treated as "no longer broadcasting". */
export const DEMO_FIX_TTL_MS = 30000;

export type Demo101Fix = {
  lat: number;
  lng: number;
  at: number;
  direction: "forward" | "reverse";
};

type Message = { type: "fix"; fix: Demo101Fix } | { type: "stop" };

function channel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  return new BroadcastChannel(CHANNEL_NAME);
}

export function publishDemo101(fix: Demo101Fix) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fix));
  } catch {
    // storage unavailable — BroadcastChannel still works within the session
  }
  const ch = channel();
  if (ch) {
    ch.postMessage({ type: "fix", fix } satisfies Message);
    ch.close();
  }
}

export function clearDemo101() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  const ch = channel();
  if (ch) {
    ch.postMessage({ type: "stop" } satisfies Message);
    ch.close();
  }
}

export function readDemo101(): Demo101Fix | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Demo101Fix;
    if (typeof parsed?.lat !== "number" || typeof parsed?.lng !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function subscribeDemo101(onChange: (fix: Demo101Fix | null) => void): () => void {
  const ch = channel();
  if (ch) {
    ch.onmessage = (event: MessageEvent<Message>) => {
      onChange(event.data.type === "fix" ? event.data.fix : null);
    };
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange(readDemo101());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    ch?.close();
    window.removeEventListener("storage", onStorage);
  };
}

/** Assumed cruising speed used only for the demo ETA display. */
const DEMO_SPEED_KMH = 30;

/** Builds the ActiveBus shape every existing component already consumes. */
export function demo101ToActiveBus(
  fix: Demo101Fix,
  routeStops: BusStop[],
  route: Route | null,
): ActiveBus {
  const dirStops = fix.direction === "reverse" ? [...routeStops].reverse() : routeStops;
  let nearest = 0;
  let nearestKm = Number.POSITIVE_INFINITY;
  dirStops.forEach((s, i) => {
    const d = haversineKm(fix.lat, fix.lng, s.lat, s.lng);
    if (d < nearestKm) {
      nearestKm = d;
      nearest = i;
    }
  });
  const nextIndex = Math.min(nearest, dirStops.length - 1);
  const statuses: StopStatus[] = dirStops.map((_, i) =>
    i < nextIndex ? "passed" : i === nextIndex ? "next" : "upcoming",
  );
  const stops: StopProgress[] = dirStops.map((stop, i) => ({
    stop,
    status: statuses[i]!,
    distanceKm: haversineKm(fix.lat, fix.lng, stop.lat, stop.lng),
  }));
  const nextStop = dirStops[nextIndex] ?? null;
  const nextDistanceKm = nextStop ? haversineKm(fix.lat, fix.lng, nextStop.lat, nextStop.lng) : null;
  const progress: RouteProgress = {
    stops,
    nextStop,
    nextDistanceKm,
    etaMinutes: nextDistanceKm != null ? Math.round((nextDistanceKm / DEMO_SPEED_KMH) * 60) : null,
    completedCount: nextIndex,
    totalStops: dirStops.length,
    tripCompleted: false,
    distanceSource: "route",
  };
  const bus: Bus = {
    id: DEMO_BUS_101_ID,
    bus_number: "101",
    registration: null,
    capacity: 0,
    route_id: route?.id ?? null,
  };
  return {
    bus,
    route,
    trip: {
      id: "demo-trip-101",
      bus_id: DEMO_BUS_101_ID,
      route_id: route?.id ?? null,
      driver_name: null,
      status: "active",
      started_at: new Date(fix.at).toISOString(),
      ended_at: null,
    },
    location: {
      id: `${DEMO_BUS_101_ID}-latest`,
      bus_id: DEMO_BUS_101_ID,
      trip_id: "demo-trip-101",
      lat: fix.lat,
      lng: fix.lng,
      accuracy: null,
      speed: null,
      heading: null,
      recorded_at: new Date(fix.at).toISOString(),
    },
    status: "live",
    ageSeconds: Math.max(0, (Date.now() - fix.at) / 1000),
    progress,
    avgSpeedMs: null,
    directionLabel: fix.direction === "reverse" ? "AIEM → Bicholim" : "Bicholim → AIEM",
    isSimulated: true,
  };
}
