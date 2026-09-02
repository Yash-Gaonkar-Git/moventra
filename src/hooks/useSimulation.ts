import { useCallback, useEffect, useMemo, useState } from "react";
import { computeSimulatedBuses, toActiveBus, simulatedBusRegistry } from "@/lib/simulation";
import { fetchRoadRoute, getCachedRoadRoute, type LatLng } from "@/lib/roadRoute";
import type { ActiveBus, Bus, BusStop, Route } from "@/lib/transit";

const STORAGE_KEY = "transittrack.simulation.startedAt";
const CHANNEL_NAME = "transittrack-simulation";
const TICK_MS = 1000;

type ChannelMessage = { type: "start"; startedAtMs: number } | { type: "stop" };

function readStoredStart(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeStoredStart(startedAtMs: number | null) {
  try {
    if (startedAtMs == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(startedAtMs));
  } catch {
    // localStorage unavailable (private mode etc.) — simulation still works
    // within this tab via React state, just without cross-tab sync.
  }
}

/**
 * Buses 102–110 only. Bus 101 is never touched here — it's owned entirely
 * by useLiveFleet's real Supabase data. Start/stop is shared across any open
 * tabs of this app (Admin control, Passenger view) via BroadcastChannel +
 * localStorage — both pure browser APIs, no backend call of any kind.
 */
export function useSimulation(orderedRouteStops: BusStop[], route: Route | null) {
  const [startedAtMs, setStartedAtMs] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readStoredStart(),
  );
  const [now, setNow] = useState(() => Date.now());

  // Real road-following geometry (OSRM), shared with the static route line
  // already drawn on the map — same cache, same honest fallback if routing
  // is unreachable. Buses simply don't render until this resolves, so they
  // never appear moving in a straight line before the real path arrives.
  const stopLine = useMemo<LatLng[]>(
    () => orderedRouteStops.map((s) => [s.lat, s.lng] as LatLng),
    [orderedRouteStops],
  );
  const [roadPath, setRoadPath] = useState<LatLng[] | null>(() =>
    stopLine.length > 1 ? (getCachedRoadRoute(stopLine) ?? null) : null,
  );
  useEffect(() => {
    if (stopLine.length < 2) return;
    const cached = getCachedRoadRoute(stopLine);
    if (cached) {
      setRoadPath(cached);
      return;
    }
    let cancelled = false;
    void fetchRoadRoute(stopLine).then((path) => {
      if (!cancelled) setRoadPath(path);
    });
    return () => {
      cancelled = true;
    };
  }, [stopLine]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data.type === "start") setStartedAtMs(event.data.startedAtMs);
      else setStartedAtMs(null);
    };
    return () => channel.close();
  }, []);

  // Catch state set by another tab before this tab's listener attached.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setStartedAtMs(e.newValue ? Number(e.newValue) : null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (startedAtMs == null) return;
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [startedAtMs]);

  const start = useCallback(() => {
    const ts = Date.now();
    setStartedAtMs(ts);
    writeStoredStart(ts);
    setNow(ts);
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      new BroadcastChannel(CHANNEL_NAME).postMessage({ type: "start", startedAtMs: ts } satisfies ChannelMessage);
    }
  }, []);

  const stop = useCallback(() => {
    setStartedAtMs(null);
    writeStoredStart(null);
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      new BroadcastChannel(CHANNEL_NAME).postMessage({ type: "stop" } satisfies ChannelMessage);
    }
  }, []);

  const simulatedBuses = useMemo<ActiveBus[]>(() => {
    if (startedAtMs == null || orderedRouteStops.length < 2 || !roadPath) return [];
    return computeSimulatedBuses(orderedRouteStops, roadPath, startedAtMs, now)
      .filter((r) => r.hasDeparted)
      .map((r) => toActiveBus(r, route));
  }, [orderedRouteStops, roadPath, startedAtMs, now, route]);

  /** Synthetic bus-registry entries (102–110) so search/lookups work even for buses not yet departed. Never written to Supabase. */
  const simulatedBuses_registry = useMemo<Bus[]>(() => simulatedBusRegistry(), []);

  return {
    running: startedAtMs != null,
    startedAtMs,
    start,
    stop,
    simulatedBuses,
    simulatedBusRegistry: simulatedBuses_registry,
    /** False while the real road geometry is still being fetched/resolved — buses withhold rendering until then rather than show a straight-line jump. */
    roadPathReady: roadPath != null,
  };
}
