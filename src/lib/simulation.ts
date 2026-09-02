import { haversineKm, type ActiveBus, type Bus, type BusStop, type Route, type RouteProgress, type StopProgress, type StopStatus } from "@/lib/transit";
import type { LatLng } from "@/lib/roadRoute";

// ---------------------------------------------------------------------------
// DEMO-ONLY SIMULATION ENGINE
// ---------------------------------------------------------------------------
// Everything in this file is a pure, frontend-only, in-memory computation.
// It never calls Supabase, never writes a trip/GPS/bus row, and never
// touches the real Bus 101 (which is entirely owned by useLiveFleet + the
// real driver/GPS/RLS system). Simulated buses are plain TypeScript objects
// shaped like the app's existing ActiveBus/Bus/Route types so every existing
// UI component (map, search, stop panel, admin table) renders them with
// zero changes — this file is the ONLY place simulation logic lives.
//
// Honesty note on "road-following": this backend has no stored road polyline
// (no PostGIS geometry column) — the only real geometry available is the
// ordered list of real bus_stops coordinates. "Road-following" here means
// following that real stop-to-stop sequence (not a straight line from origin
// to destination) rather than fabricating curved road geometry that doesn't
// exist in the database.
// ---------------------------------------------------------------------------

export type SimDirection = "forward" | "reverse";

export type SimBusConfig = {
  number: string;
  direction: SimDirection;
  /** Minutes after the simulation starts that this bus departs its origin. */
  departureOffsetMin: number;
};

/** Configurable schedule — matches the spec's departure table exactly. */
export const SIM_BUS_CONFIGS: SimBusConfig[] = [
  { number: "102", direction: "forward", departureOffsetMin: 0 },
  { number: "103", direction: "forward", departureOffsetMin: 1 },
  { number: "104", direction: "forward", departureOffsetMin: 2 },
  { number: "105", direction: "forward", departureOffsetMin: 3 },
  { number: "106", direction: "reverse", departureOffsetMin: 0 },
  { number: "107", direction: "reverse", departureOffsetMin: 1 },
  { number: "108", direction: "reverse", departureOffsetMin: 2 },
  { number: "109", direction: "reverse", departureOffsetMin: 3 },
  { number: "110", direction: "reverse", departureOffsetMin: 4 },
];

/** Exactly 10 simulated seconds, per spec — scaled by SIM_TIME_MULTIPLIER like everything else on the clock. */
export const STOP_WAIT_SIM_SECONDS = 10;
export const MIN_SPEED_KMH = 40;
export const MAX_SPEED_KMH = 60;

/**
 * "1 real second = this many simulated seconds." Configurable in one place.
 * 12x keeps a ~20 real-world-minute round trip to a demo-friendly ~1.5–2
 * real minutes while keeping every duration (departures, dwell, travel)
 * scaled consistently off the same clock.
 */
export const SIM_TIME_MULTIPLIER = 12;

export const REAL_BUS_DIRECTION_LABEL = "Bicholim → AIEM";

export function directionLabel(direction: SimDirection): string {
  return direction === "forward" ? "Bicholim → AIEM" : "AIEM → Bicholim";
}

function clampSpeed(v: number): number {
  return Math.min(MAX_SPEED_KMH, Math.max(MIN_SPEED_KMH, v));
}

/** Deterministic, smoothly-varying speed for one leg of one bus. Never Math.random(). */
function legBaseSpeedKmh(busIndex: number, legIndex: number): number {
  return clampSpeed(50 + 8 * Math.sin(busIndex * 1.7 + legIndex * 0.9));
}

function inLegSpeedKmh(busIndex: number, legIndex: number, fraction: number): number {
  const base = legBaseSpeedKmh(busIndex, legIndex);
  return clampSpeed(base + 4 * Math.sin(fraction * Math.PI));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type Phase =
  | { kind: "traveling"; legIndex: number; fraction: number }
  | { kind: "dwelling"; stopIndex: number }
  | { kind: "completed" };

// ---------------------------------------------------------------------------
// Road-geometry helpers. `roadPath` is the real driving polyline from OSRM
// (see lib/roadRoute.ts) — many points tracing actual roads, not just the 7
// stop coordinates. When OSRM is unreachable, roadRoute.ts's own fallback
// makes `roadPath` equal the straight stop-to-stop line; the math below
// degrades to the old straight-line behavior automatically in that case,
// with no special-casing needed here — it's the same honest fallback this
// app already uses for the real route's polyline on the map.
// ---------------------------------------------------------------------------

function cumulativeKm(path: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1]! + haversineKm(path[i - 1]![0], path[i - 1]![1], path[i]![0], path[i]![1]));
  }
  return cum;
}

function nearestPathIndex(path: LatLng[], lat: number, lng: number): number {
  let bestI = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length; i++) {
    const d = haversineKm(lat, lng, path[i]![0], path[i]![1]);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

/** Interpolated point at a given cumulative distance along the road path — walks the real road, not a straight line between stops. */
function pointAtDistance(path: LatLng[], cum: number[], targetKm: number): LatLng {
  const last = cum.length - 1;
  if (targetKm <= 0) return path[0]!;
  if (targetKm >= cum[last]!) return path[last]!;
  let lo = 0;
  let hi = last;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= targetKm) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi]! - cum[lo]!;
  const t = segLen > 0 ? (targetKm - cum[lo]!) / segLen : 0;
  return [lerp(path[lo]![0], path[hi]![0], t), lerp(path[lo]![1], path[hi]![1], t)];
}

type Timeline = {
  /** Directional stop order (already forward or reversed) with real coordinates. */
  dirStops: BusStop[];
  /** The real road polyline, oriented for this direction of travel. */
  dirRoadPath: LatLng[];
  dirRoadCumKm: number[];
  /** Each stop's position along dirRoadPath, in road-distance km. */
  stopCumKm: number[];
  legDurationsSec: number[];
  /** Cumulative sim-seconds at which each leg starts (index i = start of leg i). */
  legStartsSec: number[];
  /** Cumulative sim-seconds at which the bus arrives at stop i (i=0 is departure, so arrivesAtSec[0]=0). */
  arrivesAtSec: number[];
  totalDurationSec: number;
};

function buildTimeline(
  orderedStops: BusStop[],
  roadPath: LatLng[],
  direction: SimDirection,
  busIndex: number,
): Timeline {
  const dirStops = direction === "forward" ? orderedStops : [...orderedStops].reverse();
  const dirRoadPath = direction === "forward" ? roadPath : [...roadPath].reverse();
  const dirRoadCumKm = cumulativeKm(dirRoadPath);
  const stopCumKm = dirStops.map((s) => dirRoadCumKm[nearestPathIndex(dirRoadPath, s.lat, s.lng)]!);

  const legDurationsSec: number[] = [];
  const legStartsSec: number[] = [];
  const arrivesAtSec: number[] = [0];
  let t = 0;
  for (let i = 0; i < dirStops.length - 1; i++) {
    // Real road distance for this leg (falls back to straight-line distance
    // automatically when roadPath === the stop line, per roadRoute.ts).
    const distanceKm = Math.max(0, stopCumKm[i + 1]! - stopCumKm[i]!);
    const speed = legBaseSpeedKmh(busIndex, i);
    const legSec = (distanceKm / speed) * 3600;
    legStartsSec.push(t);
    legDurationsSec.push(legSec);
    t += legSec;
    arrivesAtSec.push(t);
    const isFinal = i + 1 === dirStops.length - 1;
    if (!isFinal) t += STOP_WAIT_SIM_SECONDS;
  }
  return { dirStops, dirRoadPath, dirRoadCumKm, stopCumKm, legDurationsSec, legStartsSec, arrivesAtSec, totalDurationSec: t };
}

function phaseAt(timeline: Timeline, elapsedSec: number): Phase {
  const { legStartsSec, legDurationsSec, arrivesAtSec, totalDurationSec, dirStops } = timeline;
  if (elapsedSec >= totalDurationSec) return { kind: "completed" };
  for (let i = 0; i < legDurationsSec.length; i++) {
    const legStart = legStartsSec[i]!;
    const legEnd = legStart + legDurationsSec[i]!;
    if (elapsedSec < legEnd) {
      const fraction = legDurationsSec[i]! > 0 ? (elapsedSec - legStart) / legDurationsSec[i]! : 1;
      return { kind: "traveling", legIndex: i, fraction: Math.min(1, Math.max(0, fraction)) };
    }
    const isFinal = i + 1 === dirStops.length - 1;
    if (!isFinal) {
      const dwellEnd = arrivesAtSec[i + 1]! + STOP_WAIT_SIM_SECONDS;
      if (elapsedSec < dwellEnd) return { kind: "dwelling", stopIndex: i + 1 };
    }
  }
  return { kind: "completed" };
}

export type SimulatedBusResult = {
  busId: string;
  config: SimBusConfig;
  hasDeparted: boolean;
  lat: number;
  lng: number;
  speedKmh: number;
  progress: RouteProgress;
};

/**
 * Pure function: given the real route's ordered stops and a shared
 * simulation start time, compute every simulated bus's current state. Same
 * inputs always produce the same outputs — this is what lets every open
 * tab (admin + passenger) render identical positions from just one shared
 * `startedAtMs`, with no continuous network sync required.
 */
export function computeSimulatedBuses(
  orderedStops: BusStop[],
  roadPath: LatLng[],
  startedAtMs: number,
  nowMs: number,
): SimulatedBusResult[] {
  if (orderedStops.length < 2 || roadPath.length < 2) return [];
  const elapsedRealSec = Math.max(0, (nowMs - startedAtMs) / 1000);
  const elapsedSimSecGlobal = elapsedRealSec * SIM_TIME_MULTIPLIER;

  return SIM_BUS_CONFIGS.map((config, busIndex) => {
    const busId = `sim-${config.number}`;
    const timeline = buildTimeline(orderedStops, roadPath, config.direction, busIndex);
    const departureSec = config.departureOffsetMin * 60;
    const elapsedSinceDeparture = elapsedSimSecGlobal - departureSec;
    const hasDeparted = elapsedSinceDeparture >= 0;
    const { dirStops } = timeline;
    const finalStop = dirStops[dirStops.length - 1]!;
    const firstStop = dirStops[0]!;

    if (!hasDeparted) {
      // Not yet departed: parked at origin, not shown as live by callers
      // (hasDeparted lets the caller filter it out of "active" lists).
      return {
        busId,
        config,
        hasDeparted: false,
        lat: firstStop.lat,
        lng: firstStop.lng,
        speedKmh: 0,
        progress: buildProgress(dirStops, dirStops.map(() => "upcoming" as StopStatus), null, null, 0, false, firstStop.lat, firstStop.lng),
      };
    }

    const phase = phaseAt(timeline, elapsedSinceDeparture);

    if (phase.kind === "completed") {
      const statuses = dirStops.map(() => "passed" as StopStatus);
      return {
        busId,
        config,
        hasDeparted: true,
        lat: finalStop.lat,
        lng: finalStop.lng,
        speedKmh: 0,
        progress: buildProgress(dirStops, statuses, null, null, dirStops.length, true, finalStop.lat, finalStop.lng),
      };
    }

    if (phase.kind === "dwelling") {
      const stop = dirStops[phase.stopIndex]!;
      const statuses = dirStops.map((_, i) => (i <= phase.stopIndex ? "passed" : i === phase.stopIndex + 1 ? "next" : "upcoming") as StopStatus);
      const nextStop = dirStops[phase.stopIndex + 1] ?? null;
      const legDistanceKm =
        nextStop != null
          ? Math.max(0, timeline.stopCumKm[phase.stopIndex + 1]! - timeline.stopCumKm[phase.stopIndex]!)
          : 0;
      const etaMinutes = nextStop
        ? Math.round((legDistanceKm / inLegSpeedKmh(busIndex, phase.stopIndex, 0)) * 60)
        : null;
      return {
        busId,
        config,
        hasDeparted: true,
        lat: stop.lat,
        lng: stop.lng,
        speedKmh: 0,
        progress: buildProgress(dirStops, statuses, nextStop, etaMinutes, phase.stopIndex + 1, false, stop.lat, stop.lng),
      };
    }

    // traveling — walk the real road polyline, not a straight line between stops.
    const to = dirStops[phase.legIndex + 1]!;
    const legStartKm = timeline.stopCumKm[phase.legIndex]!;
    const legEndKm = timeline.stopCumKm[phase.legIndex + 1]!;
    const targetKm = legStartKm + phase.fraction * (legEndKm - legStartKm);
    const [lat, lng] = pointAtDistance(timeline.dirRoadPath, timeline.dirRoadCumKm, targetKm);
    const speedKmh = inLegSpeedKmh(busIndex, phase.legIndex, phase.fraction);
    const remainingKm = Math.max(0, legEndKm - targetKm);
    const etaMinutes = speedKmh > 0 ? Math.round((remainingKm / speedKmh) * 60) : null;
    const statuses = dirStops.map((_, i) => (i <= phase.legIndex ? "passed" : i === phase.legIndex + 1 ? "next" : "upcoming") as StopStatus);
    return {
      busId,
      config,
      hasDeparted: true,
      lat,
      lng,
      speedKmh,
      progress: buildProgress(dirStops, statuses, to, etaMinutes, phase.legIndex + 1, false, lat, lng),
    };
  });
}

function buildProgress(
  dirStops: BusStop[],
  statuses: StopStatus[],
  nextStop: BusStop | null,
  etaMinutes: number | null,
  completedCount: number,
  tripCompleted: boolean,
  fromLat: number,
  fromLng: number,
): RouteProgress {
  const totalStops = dirStops.length;
  const stops: StopProgress[] = dirStops.map((stop, i) => ({
    stop,
    status: tripCompleted ? "passed" : statuses[i]!,
    distanceKm: haversineKm(fromLat, fromLng, stop.lat, stop.lng),
  }));
  const nextDistanceKm = nextStop ? haversineKm(fromLat, fromLng, nextStop.lat, nextStop.lng) : null;
  return {
    stops,
    nextStop: tripCompleted ? null : nextStop,
    nextDistanceKm: tripCompleted ? null : nextDistanceKm,
    etaMinutes: tripCompleted ? null : etaMinutes,
    completedCount: tripCompleted ? totalStops : completedCount,
    totalStops,
    tripCompleted,
    distanceSource: "route",
  };
}

/** Turns one SimulatedBusResult into the exact ActiveBus shape every existing component already consumes. */
export function toActiveBus(result: SimulatedBusResult, route: Route | null): ActiveBus {
  const bus: Bus = {
    id: result.busId,
    bus_number: result.config.number,
    registration: null,
    capacity: 0,
    route_id: null,
  };
  const status = result.progress.tripCompleted ? "completed" : "live";
  return {
    bus,
    route,
    trip: {
      id: `sim-trip-${result.config.number}`,
      bus_id: result.busId,
      route_id: route?.id ?? null,
      driver_name: null,
      status: result.progress.tripCompleted ? "completed" : "active",
      started_at: new Date().toISOString(),
      ended_at: null,
    },
    location: {
      id: `${result.busId}-latest`,
      bus_id: result.busId,
      trip_id: `sim-trip-${result.config.number}`,
      lat: result.lat,
      lng: result.lng,
      accuracy: null,
      speed: null,
      heading: null,
      recorded_at: new Date().toISOString(),
    },
    status,
    ageSeconds: 0,
    progress: result.progress,
    avgSpeedMs: result.speedKmh / 3.6,
    directionLabel: directionLabel(result.config.direction),
    isSimulated: true,
  };
}

/** Synthetic bus-registry entries for search — never written to Supabase, only used for the in-memory `buses` list passed to search/UI. */
export function simulatedBusRegistry(): Bus[] {
  return SIM_BUS_CONFIGS.map((c) => ({
    id: `sim-${c.number}`,
    bus_number: c.number,
    registration: null,
    capacity: 0,
    route_id: null,
  }));
}
