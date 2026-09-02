import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchActiveTrips,
  fetchBusStatusRpc,
  fetchFleet,
  fetchTripEtaRpc,
  fetchTripProgressRpc,
  mapBusStatus,
  mapTripProgress,
  secondsSince,
  type ActiveBus,
  type Bus,
  type BusStop,
  type LiveLocation,
  type Route,
  type RouteProgress,
  type Trip,
} from "@/lib/transit";

export type ConnectionState = "connecting" | "connected" | "error";

type TripIntel = {
  progress: Record<string, unknown> | null;
  eta: Record<string, unknown> | null;
  statusJson: Record<string, unknown> | null;
};

/**
 * Periodic re-check so a bus can go OFFLINE/DELAYED purely from time passing,
 * even with no new GPS event to react to. GPS inserts and trip changes still
 * trigger an immediate targeted refresh via Realtime — this is just the
 * backstop.
 */
const REFRESH_INTERVAL_MS = 10000;

export function useLiveFleet() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<BusStop[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  /** Real transit-intelligence RPC results, keyed by trip id. */
  const [intel, setIntel] = useState<Record<string, TripIntel>>({});
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);
  const tripsRef = useRef<Trip[]>([]);
  tripsRef.current = trips;

  const refreshIntel = useCallback(async (activeTrips: Trip[]) => {
    if (activeTrips.length === 0) {
      if (mounted.current) setIntel({});
      return;
    }
    const results = await Promise.all(
      activeTrips.map(async (trip) => {
        try {
          const [progress, eta, statusJson] = await Promise.all([
            fetchTripProgressRpc(trip.id),
            fetchTripEtaRpc(trip.id),
            fetchBusStatusRpc(trip.bus_id),
          ]);
          return [trip.id, { progress, eta, statusJson }] as const;
        } catch {
          return [trip.id, { progress: null, eta: null, statusJson: null }] as const;
        }
      }),
    );
    if (!mounted.current) return;
    setIntel((prev) => {
      const next: Record<string, TripIntel> = {};
      const liveIds = new Set(activeTrips.map((t) => t.id));
      // Drop intel for trips that are no longer active.
      for (const id of Object.keys(prev)) {
        if (liveIds.has(id)) next[id] = prev[id]!;
      }
      for (const [id, val] of results) next[id] = val;
      return next;
    });
  }, []);

  const refreshOneBus = useCallback(
    async (busId: string) => {
      const trip = tripsRef.current.find((t) => t.bus_id === busId);
      if (!trip) return;
      await refreshIntel([trip]);
    },
    [refreshIntel],
  );

  const reload = useCallback(async () => {
    try {
      const fleet = await fetchFleet();
      const activeTrips = await fetchActiveTrips();
      if (!mounted.current) return;
      setRoutes(fleet.routes);
      setStops(fleet.stops);
      setBuses(fleet.buses);
      setTrips(activeTrips);
      setLoading(false);
      await refreshIntel(activeTrips);
    } catch {
      if (mounted.current) setConnection("error");
    }
  }, [refreshIntel]);

  useEffect(() => {
    mounted.current = true;
    void reload();

    const channel = supabase
      .channel("transit-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_locations" },
        (payload) => {
          const row = payload.new as { bus_id: string };
          void refreshOneBus(row.bus_id);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trip_stop_events" },
        (payload) => {
          const row = payload.new as { bus_id: string };
          void refreshOneBus(row.bus_id);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
        void fetchActiveTrips()
          .then((t) => {
            if (!mounted.current) return;
            setTrips(t);
            void refreshIntel(t);
          })
          .catch(() => undefined);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("connected");
          // Refresh after (re)connecting so passengers see current data again.
          void reload();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("error");
        }
      });

    const interval = setInterval(() => {
      setTick((t) => t + 1);
      void refreshIntel(tripsRef.current);
    }, REFRESH_INTERVAL_MS);

    return () => {
      mounted.current = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [reload, refreshIntel, refreshOneBus]);

  const activeBuses = useMemo<ActiveBus[]>(() => {
    void tick;
    const byId = new Map(buses.map((b) => [b.id, b]));
    const routeById = new Map(routes.map((r) => [r.id, r]));
    return trips
      .map((trip) => {
        const bus = byId.get(trip.bus_id);
        if (!bus) return null;
        const route = routeById.get(trip.route_id ?? "") ?? null;
        const routeStops = route
          ? stops.filter((s) => s.route_id === route.id).sort((a, b) => a.sequence - b.sequence)
          : [];

        const tripIntel = intel[trip.id];
        const progressJson = tripIntel?.progress ?? null;
        const etaJson = tripIntel?.eta ?? null;
        const statusJson = tripIntel?.statusJson ?? null;

        const progress: RouteProgress | null = route
          ? mapTripProgress(routeStops, progressJson, etaJson, trip.status)
          : null;

        const lastLoc = progressJson?.["last_location"] as
          | { latitude: number; longitude: number; recorded_at: string }
          | undefined;
        const location: LiveLocation | null =
          Boolean(progressJson?.["has_location"]) && lastLoc
            ? {
                id: `${trip.id}-latest`,
                bus_id: bus.id,
                trip_id: trip.id,
                lat: lastLoc.latitude,
                lng: lastLoc.longitude,
                accuracy: null,
                speed: null,
                heading: null,
                recorded_at: lastLoc.recorded_at,
              }
            : null;

        const ageSeconds = secondsSince(location?.recorded_at);
        const status = mapBusStatus(statusJson);
        const speedRaw =
          etaJson && etaJson["eta_available"] ? Number(etaJson["avg_speed_mps"]) : NaN;
        const avgSpeedMs = Number.isFinite(speedRaw) ? speedRaw : null;

        return {
          bus,
          trip,
          route,
          location,
          ageSeconds,
          status,
          progress,
          avgSpeedMs,
          directionLabel: "Bicholim → AIEM",
          isSimulated: false,
        } as ActiveBus;
      })
      .filter((b): b is ActiveBus => b !== null)
      .sort((a, b) => a.bus.bus_number.localeCompare(b.bus.bus_number));
  }, [buses, routes, stops, trips, intel, tick]);

  return { routes, stops, buses, trips, activeBuses, connection, loading, reload };
}
