import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSession, onAuthStateChange } from "@/lib/transit";
import { clearDemoPassengerSession, getDemoPassengerSession } from "@/lib/demoSession";

/**
 * Real passenger bus-stop-proximity subscriptions, backed by the backend's
 * `passenger_alerts` table. A row is only ever created for the signed-in
 * passenger (subscriber_id = their own auth uid) and is triggered
 * server-side from real GPS proximity — nothing here simulates a trigger.
 *
 * EXCEPTION: when a temporary presentation Demo Login is active (see
 * lib/demoSession.ts), alerts are kept in localStorage only — no Supabase
 * call of any kind, and no real server-side proximity trigger. This is a
 * frontend-only demo affordance, clearly distinct from the real feature.
 */
export type BusAlert = {
  busId: string;
  busNumber: string;
  stopId: string;
  stopName: string;
};

type AlertRow = {
  bus_id: string | null;
  stop_id: string | null;
};

const DEMO_ALERTS_KEY = "transittrack.demoPassengerAlerts";

function readDemoAlerts(): BusAlert[] {
  try {
    const raw = window.localStorage.getItem(DEMO_ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BusAlert[]) : [];
  } catch {
    return [];
  }
}

function writeDemoAlerts(alerts: BusAlert[]): void {
  try {
    window.localStorage.setItem(DEMO_ALERTS_KEY, JSON.stringify(alerts));
  } catch {
    // no-op — demo alerts just won't persist across reloads in this case
  }
}

/** A subscription the backend has just confirmed the bus is within ~500m of (see process_live_location). */
export type TriggeredAlert = BusAlert & { triggeredAt: string };

export function useBusAlerts() {
  const [alerts, setAlerts] = useState<BusAlert[]>([]);
  // Alerts the backend's real GPS-proximity check has just fired — this is
  // the actual "bus is arriving" signal (process_live_location flips
  // active -> triggered within 500m). Previously nothing consumed this: the
  // row simply dropped out of the active-only query above with no banner
  // and no notification ever shown for it.
  const [triggered, setTriggered] = useState<TriggeredAlert[]>([]);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  // Signed-out passengers keep their alerts locally instead of being asked to log in.
  const [localOnly, setLocalOnly] = useState(false);
  // Display names aren't stored server-side on the subscription row itself
  // beyond the free-text `message` — keep the names the caller already knows
  // (from the live fleet/stops already loaded) so the "My alerts" list can
  // show them without an extra join.
  const namesRef = useRef<Map<string, { busNumber: string; stopName: string }>>(new Map());
  const uidRef = useRef<string | null>(null);

  const loadAlerts = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("passenger_alerts")
      .select("bus_id, stop_id")
      .eq("subscriber_id", uid)
      .eq("status", "active")
      .eq("alert_type", "stop_proximity");
    if (error || !data) return;
    setAlerts(
      (data as AlertRow[])
        .filter((r): r is { bus_id: string; stop_id: string } => !!r.bus_id && !!r.stop_id)
        .map((r) => {
          const names = namesRef.current.get(`${r.bus_id}:${r.stop_id}`);
          return {
            busId: r.bus_id,
            busNumber: names?.busNumber ?? "",
            stopId: r.stop_id,
            stopName: names?.stopName ?? "",
          };
        }),
    );
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const setup = async () => {
      if (getDemoPassengerSession()) {
        if (cancelled) return;
        uidRef.current = null;
        setIsDemo(true);
        setLocalOnly(false);
        setNeedsAuth(false);
        setAlerts(readDemoAlerts());
        return;
      }
      setIsDemo(false);
      const session = await getSession();
      const uid = session?.user?.id ?? null;
      uidRef.current = uid;
      if (cancelled) return;
      setNeedsAuth(false);
      if (!uid) {
        setLocalOnly(true);
        setAlerts(readDemoAlerts());
        return;
      }
      setLocalOnly(false);
      await loadAlerts(uid);
      channel = supabase
        .channel(`passenger-alerts-${uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "passenger_alerts",
            filter: `subscriber_id=eq.${uid}`,
          },
          (payload) => {
            const oldRow = payload.old as { status?: string } | null;
            const newRow = payload.new as
              | { status?: string; bus_id?: string | null; stop_id?: string | null; triggered_at?: string | null }
              | null;
            if (
              newRow?.status === "triggered" &&
              oldRow?.status !== "triggered" &&
              newRow.bus_id &&
              newRow.stop_id
            ) {
              const busId = newRow.bus_id;
              const stopId = newRow.stop_id;
              const names = namesRef.current.get(`${busId}:${stopId}`);
              setTriggered((prev) => [
                ...prev.filter(
                  (t) => !(t.busId === busId && t.stopId === stopId),
                ),
                {
                  busId,
                  busNumber: names?.busNumber ?? "",
                  stopId,
                  stopName: names?.stopName ?? "",
                  triggeredAt: newRow.triggered_at ?? new Date().toISOString(),
                },
              ]);
            }
            void loadAlerts(uid);
          },
        )
        .subscribe();
    };

    void setup();
    const unsubscribeAuth = onAuthStateChange(() => void setup());

    return () => {
      cancelled = true;
      unsubscribeAuth();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [loadAlerts]);

  const isAlertOn = useCallback(
    (busId: string, stopId: string) =>
      alerts.some((a) => a.busId === busId && a.stopId === stopId),
    [alerts],
  );

  /** No-op when signed out and not in demo mode — callers should check `needsAuth` and prompt sign-in first. */
  const turnOn = useCallback(
    (alert: BusAlert) => {
      if (isDemo || localOnly) {
        setAlerts((prev) => {
          if (prev.some((a) => a.busId === alert.busId && a.stopId === alert.stopId)) return prev;
          const next = [...prev, alert];
          writeDemoAlerts(next);
          return next;
        });
        return;
      }
      const uid = uidRef.current;
      if (!uid) return;
      namesRef.current.set(`${alert.busId}:${alert.stopId}`, {
        busNumber: alert.busNumber,
        stopName: alert.stopName,
      });
      void supabase
        .from("passenger_alerts")
        .insert({
          subscriber_id: uid,
          bus_id: alert.busId,
          stop_id: alert.stopId,
          alert_type: "stop_proximity",
          status: "active",
          message: `Notify me when Bus ${alert.busNumber} approaches ${alert.stopName}`,
        })
        .then(({ error }) => {
          if (!error) void loadAlerts(uid);
        });
    },
    [isDemo, localOnly, loadAlerts],
  );

  const turnOff = useCallback(
    (busId: string, stopId: string) => {
      if (isDemo || localOnly) {
        setAlerts((prev) => {
          const next = prev.filter((a) => !(a.busId === busId && a.stopId === stopId));
          writeDemoAlerts(next);
          return next;
        });
        return;
      }
      const uid = uidRef.current;
      if (!uid) return;
      // Matches the backend's RLS: only an active subscription can be
      // cancelled by its owner (active -> cancelled).
      void supabase
        .from("passenger_alerts")
        .update({ status: "cancelled" })
        .eq("subscriber_id", uid)
        .eq("bus_id", busId)
        .eq("stop_id", stopId)
        .eq("status", "active")
        .then(({ error }) => {
          if (!error) {
            setAlerts((prev) => prev.filter((a) => !(a.busId === busId && a.stopId === stopId)));
          }
        });
    },
    [isDemo, localOnly],
  );

  /** Ends the demo-passenger session and clears its local alerts, reverting to the real (signed-out) state. */
  const exitDemo = useCallback(() => {
    clearDemoPassengerSession();
    writeDemoAlerts([]);
    setIsDemo(false);
    setAlerts([]);
    setTriggered([]);
    setNeedsAuth(true);
  }, []);

  /** Removes a fired alert from the "just arrived" list once the passenger has seen it. */
  const dismissTriggered = useCallback((busId: string, stopId: string) => {
    setTriggered((prev) => prev.filter((t) => !(t.busId === busId && t.stopId === stopId)));
  }, []);

  return { alerts, triggered, dismissTriggered, isAlertOn, turnOn, turnOff, needsAuth, isDemo, exitDemo };
}
