import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// These type shapes intentionally match what the existing UI components
// already expect (Route.code, BusStop.lat/lng/sequence, Bus.bus_number, ...).
// The REAL backend uses different column names (route_code, latitude/
// longitude/stop_order, ...) — the fetch functions below translate between
// the two so no component file needs to change. See the mapping comments
// on each fetcher for exactly what's real vs. derived-for-display.
// ---------------------------------------------------------------------------

export type Route = {
  id: string;
  code: string;
  name: string;
  /** Not stored server-side (no routes.color column) — a stable colour derived from the route code, for map display only. */
  color: string;
  /** No stored route geometry server-side; always empty so callers fall back to the real ordered bus_stops. */
  path: [number, number][];
};

export type BusStop = {
  id: string;
  route_id: string | null;
  name: string;
  lat: number;
  lng: number;
  sequence: number;
};

export type Bus = {
  id: string;
  bus_number: string;
  /** No registration column in the real schema. */
  registration: string | null;
  capacity: number;
  /** A bus isn't permanently tied to one route server-side (route is per-trip) — always null. */
  route_id: string | null;
};

export type Trip = {
  id: string;
  bus_id: string;
  route_id: string | null;
  driver_name: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
};

export type LiveLocation = {
  id: string;
  bus_id: string;
  trip_id: string | null;
  lat: number;
  lng: number;
  /** Not stored server-side (no accuracy/speed/heading columns) — never fabricated. */
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
};

export type BusStatus = "live" | "delayed" | "offline" | "completed";

export type ActiveBus = {
  bus: Bus;
  route: Route | null;
  trip: Trip;
  location: LiveLocation | null;
  status: BusStatus;
  ageSeconds: number;
  progress: RouteProgress | null;
  /** Real measured speed from the backend's own recent-GPS-history calculation (get_eta_to_next_stop), never fabricated. */
  avgSpeedMs: number | null;
  /** e.g. "Bicholim → AIEM" — shown next to the bus number everywhere so direction is never ambiguous. */
  directionLabel: string;
  /** true only for the frontend-only demo simulation (buses 102–110) — never backed by a real trip/GPS row. */
  isSimulated: boolean;
};

/** GPS fixes newer than this count as live (client-side display only; the backend's get_bus_status is the source of truth for LIVE/OFFLINE/DELAYED/TRIP_COMPLETED). */
export const LIVE_THRESHOLD_S = 20;
/** No GPS update for this long means the bus is offline (fallback only — see above). */
export const OFFLINE_THRESHOLD_S = 90;

export function secondsSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
}

export function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds)) return "never";
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

export function kmh(speedMs: number | null | undefined): string {
  if (speedMs == null || Number.isNaN(speedMs) || speedMs < 0) return "—";
  return `${(speedMs * 3.6).toFixed(1)} km/h`;
}

/** Distance in km between two lat/lng pairs. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type StopStatus = "passed" | "next" | "upcoming" | "final";

export type StopProgress = {
  stop: BusStop;
  status: StopStatus;
  distanceKm: number;
};

export type RouteProgress = {
  stops: StopProgress[];
  nextStop: BusStop | null;
  nextDistanceKm: number | null;
  /** ETA in minutes, computed server-side from real recent GPS speed only — null when unavailable (never guessed). */
  etaMinutes: number | null;
  completedCount: number;
  totalStops: number;
  tripCompleted: boolean;
  distanceSource: "route" | "direct" | null;
};

/** Stable colour per route, since the backend doesn't store one. Display-only. */
function routeColor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 70%, 38%)`;
}

/**
 * Real column names (route_code, stop_name, latitude/longitude, stop_order)
 * mapped onto the UI's existing field names (code, name, lat/lng, sequence).
 */
export async function fetchFleet() {
  const [routesRes, stopsRes, busesRes] = await Promise.all([
    supabase.from("routes").select("*").order("route_code"),
    supabase.from("bus_stops").select("*").order("stop_order"),
    supabase.from("buses").select("*").order("bus_number"),
  ]);
  if (routesRes.error) throw routesRes.error;
  if (stopsRes.error) throw stopsRes.error;
  if (busesRes.error) throw busesRes.error;

  const routes: Route[] = (routesRes.data ?? []).map((r) => ({
    id: r.id,
    code: r.route_code,
    name: r.name,
    color: routeColor(r.route_code),
    path: [],
  }));
  const stops: BusStop[] = (stopsRes.data ?? []).map((s) => ({
    id: s.id,
    route_id: s.route_id,
    name: s.stop_name,
    lat: s.latitude,
    lng: s.longitude,
    sequence: s.stop_order,
  }));
  const buses: Bus[] = (busesRes.data ?? []).map((b) => ({
    id: b.id,
    bus_number: b.bus_number,
    registration: null,
    capacity: b.capacity ?? 0,
    route_id: null,
  }));
  return { routes, stops, buses };
}

export async function fetchActiveTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("status", "active")
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    bus_id: t.bus_id,
    route_id: t.route_id,
    driver_name: null,
    status: t.status,
    started_at: t.started_at ?? t.created_at,
    ended_at: t.ended_at,
  }));
}

// ---------------------------------------------------------------------------
// Backend transit-intelligence RPCs (source of truth — no client-side ETA/
// progress/status math). See get_trip_progress / get_eta_to_next_stop /
// get_bus_status in the database.
// ---------------------------------------------------------------------------

export async function fetchTripProgressRpc(tripId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_trip_progress", { p_trip_id: tripId });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export async function fetchTripEtaRpc(tripId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_eta_to_next_stop", { p_trip_id: tripId });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export async function fetchBusStatusRpc(busId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_bus_status", { p_bus_id: busId });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export function mapBusStatus(statusJson: Record<string, unknown> | null | undefined): BusStatus {
  const s = typeof statusJson?.["status"] === "string" ? (statusJson["status"] as string) : "OFFLINE";
  if (s === "LIVE") return "live";
  if (s === "DELAYED") return "delayed";
  if (s === "TRIP_COMPLETED") return "completed";
  return "offline";
}

type StopRef = { id: string };

/**
 * Turns the backend's get_trip_progress / get_eta_to_next_stop JSON (built
 * from real live_locations + bus_stops.stop_order) into the RouteProgress
 * shape the UI already renders. Per-stop distances are computed here from
 * the real last-known GPS point using the existing haversineKm helper —
 * the backend doesn't return a distance for every stop, only the current one.
 */
export function mapTripProgress(
  routeStops: BusStop[],
  progressJson: Record<string, unknown> | null | undefined,
  etaJson: Record<string, unknown> | null | undefined,
  tripStatus: string,
): RouteProgress {
  const ordered = [...routeStops].sort((a, b) => a.sequence - b.sequence);
  const totalStops = ordered.length;
  const tripCompleted = tripStatus === "completed";

  const empty = (): RouteProgress => ({
    stops: ordered.map((stop, i) => ({
      stop,
      status: tripCompleted ? "passed" : i === totalStops - 1 ? "final" : "upcoming",
      distanceKm: Number.POSITIVE_INFINITY,
    })),
    nextStop: null,
    nextDistanceKm: null,
    etaMinutes: null,
    completedCount: tripCompleted ? totalStops : 0,
    totalStops,
    tripCompleted,
    distanceSource: null,
  });

  if (totalStops === 0 || !progressJson || progressJson["error"]) return empty();

  const hasLocation = Boolean(progressJson["has_location"]);
  const lastLoc = progressJson["last_location"] as
    | { latitude: number; longitude: number }
    | undefined;
  const currentId = (progressJson["current_stop"] as StopRef | null)?.id ?? null;
  const nextId = (progressJson["next_stop"] as StopRef | null)?.id ?? null;
  const passedIds = new Set<string>(
    ((progressJson["passed_stops"] as StopRef[] | undefined) ?? []).map((s) => s.id),
  );
  if (currentId) passedIds.add(currentId);

  const stops: StopProgress[] = ordered.map((stop, i) => {
    const distanceKm =
      hasLocation && lastLoc
        ? haversineKm(lastLoc.latitude, lastLoc.longitude, stop.lat, stop.lng)
        : Number.POSITIVE_INFINITY;
    const status: StopStatus = tripCompleted
      ? "passed"
      : passedIds.has(stop.id)
        ? "passed"
        : stop.id === nextId
          ? i === totalStops - 1
            ? "final"
            : "next"
          : i === totalStops - 1
            ? "final"
            : "upcoming";
    return { stop, status, distanceKm };
  });

  const nextStop = nextId ? (ordered.find((s) => s.id === nextId) ?? null) : null;
  const nextDistanceKm =
    hasLocation && lastLoc && nextStop
      ? haversineKm(lastLoc.latitude, lastLoc.longitude, nextStop.lat, nextStop.lng)
      : null;

  const etaAvailable = Boolean(etaJson?.["eta_available"]);
  const etaSeconds = etaAvailable ? Number(etaJson?.["eta_seconds"] ?? NaN) : NaN;
  const etaMinutes = etaAvailable && Number.isFinite(etaSeconds) ? Math.round(etaSeconds / 60) : null;

  const completedCount = tripCompleted ? totalStops : passedIds.size;

  return {
    stops,
    nextStop,
    nextDistanceKm,
    etaMinutes,
    completedCount,
    totalStops,
    tripCompleted,
    distanceSource: hasLocation ? "direct" : null,
  };
}

// ---------------------------------------------------------------------------
// Auth helpers (driver + passenger sign-in gates). Same Supabase Auth user
// pool for both — the backend's own trigger provisions a `drivers` row (kept
// inactive by default) on every real sign-up.
// ---------------------------------------------------------------------------

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

/**
 * True only when the session's JWT carries `app_metadata.role === "admin"`.
 * That claim lives on `auth.users.raw_app_meta_data`, which the client can
 * never write (no RLS policy grants authenticated/anon access to it) — it's
 * only settable via the Supabase Auth Admin API/dashboard. Checking it here
 * mirrors the same claim the backend's `drivers_update_admin` RLS policy
 * checks, so a non-admin session simply has no admin-capable calls to make.
 */
export function isAdminSession(session: Session | null): boolean {
  return session?.user?.app_metadata?.["role"] === "admin";
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Passwordless admin sign-in: send a 6-digit email OTP (no magic-link redirect). */
export async function sendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

/** Verify the 6-digit email OTP and establish the session. */
export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  fullName: string,
): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export type DriverProfile = { id: string; full_name: string; is_active: boolean };

/** The signed-in user's own drivers row (if any), respecting RLS — never another driver's. */
export async function fetchMyDriverProfile(): Promise<DriverProfile | null> {
  const session = await getSession();
  const uid = session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("drivers")
    .select("id, full_name, is_active")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** All driver records visible to the caller under existing RLS (admin approvals list). */
export async function fetchAllDrivers(): Promise<DriverProfile[]> {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, full_name, is_active")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

/** Flips only the existing drivers.is_active flag for one driver. */
export async function setDriverActive(id: string, isActive: boolean): Promise<DriverProfile> {
  const { data, error } = await supabase
    .from("drivers")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id, full_name, is_active")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "No row was updated — the current database permissions (RLS) do not allow this account to change driver approval.",
    );
  }
  return data;
}
