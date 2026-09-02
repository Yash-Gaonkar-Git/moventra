import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, ConnectionBadge } from "@/components/AppShell";
import { MapPanel } from "@/components/MapPanel";
import { StatusPill } from "@/components/StatusPill";
import { MyAlerts, StopPanel } from "@/components/StopPanel";
import { PassengerSearch } from "@/components/PassengerSearch";
import { WhereIsMyBusSheet } from "@/components/WhereIsMyBus";
import { StopsNearMeSheet } from "@/components/StopsNearMe";
import { useBusAlerts } from "@/hooks/useBusAlerts";
import { useLiveFleet } from "@/hooks/useLiveFleet";
import { useSimulation } from "@/hooks/useSimulation";
import { formatAge, LIVE_THRESHOLD_S, signInWithPassword, signUpWithPassword } from "@/lib/transit";
import { setDemoPassengerSession } from "@/lib/demoSession";

export { StatusPill };

export const Route = createFileRoute("/passenger")({
  head: () => ({
    meta: [
      { title: "Live Bus Map — TransitTrack Passenger View" },
      {
        name: "description",
        content:
          "See your bus move live on the map: next stop, distance, arrival time and trip progress, updated without refreshing.",
      },
      { property: "og:title", content: "Live Bus Map — TransitTrack" },
      {
        property: "og:description",
        content: "Track your bus live: next stop, arrival time and trip progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PassengerPage,
});

function PassengerPage() {
  const { activeBuses, buses, routes, stops, connection, loading, reload } = useLiveFleet();
  // The demo simulation (buses 102–110) — a purely frontend-only layer, never
  // touching Supabase. Bus 101 above is always the real one from useLiveFleet.
  const realRoute = routes[0] ?? null;
  const realRouteStops = useMemo(
    () =>
      realRoute
        ? stops.filter((s) => s.route_id === realRoute.id).sort((a, b) => a.sequence - b.sequence)
        : [],
    [stops, realRoute],
  );
  const sim = useSimulation(realRouteStops, realRoute);
  const allBuses = useMemo(() => [...activeBuses, ...sim.simulatedBuses], [activeBuses, sim.simulatedBuses]);
  const allBusRegistry = useMemo(
    () => [...buses, ...sim.simulatedBusRegistry],
    [buses, sim.simulatedBusRegistry],
  );
  // null = auto: follow the route of the bus being tracked.
  const [routeChoice, setRouteChoice] = useState<string | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  // Frontend-only: which stop the passenger tapped, plus their alert list.
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const { alerts, isAlertOn, turnOn, turnOff, isDemo, exitDemo } = useBusAlerts();
  const [online, setOnline] = useState(true);
  const [choosingStop, setChoosingStop] = useState(false);
  const [nearMeOpen, setNearMeOpen] = useState(false);
  const [busListOpen, setBusListOpen] = useState(false);
  const [panelBusListOpen, setPanelBusListOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [focusBus, setFocusBus] = useState<{ busId: string; token: number } | null>(null);
  const [searching, setSearching] = useState(false);
  // Alerts need a signed-in passenger (backend RLS: subscriber_id = auth.uid()).
  // Everything else on this page stays anonymous/public, as before.
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const pendingAlertRef = useRef<Parameters<typeof turnOn>[0] | null>(null);
  // Alerts no longer require signing in — they're saved right away.
  const requestAlert = useCallback(
    (alert: Parameters<typeof turnOn>[0]) => {
      turnOn(alert);
    },
    [turnOn],
  );

  useEffect(() => {
    const on = () => {
      setOnline(true);
      // Connection returned: refresh the live information automatically.
      void reload();
    };
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [reload]);

  const visibleBuses = useMemo(
    () => (routeChoice ? allBuses.filter((b) => b.route?.id === routeChoice) : allBuses),
    [allBuses, routeChoice],
  );

  // The bus being followed: explicit selection, otherwise the first active bus.
  const tracked = useMemo(
    () => visibleBuses.find((b) => b.bus.id === selectedBusId) ?? visibleBuses[0] ?? null,
    [visibleBuses, selectedBusId],
  );

  // Auto-focus the map and stop list on the tracked bus's route.
  const selectedRouteId = routeChoice ?? tracked?.route?.id ?? "";
  const trackedRoute = tracked?.route ?? routes.find((r) => r.id === selectedRouteId) ?? null;

  const routeStops = useMemo(
    () =>
      trackedRoute
        ? stops.filter((s) => s.route_id === trackedRoute.id).sort((a, b) => a.sequence - b.sequence)
        : [],
    [stops, trackedRoute],
  );

  const selectedStop = useMemo(
    () => stops.find((s) => s.id === selectedStopId) ?? null,
    [stops, selectedStopId],
  );

  // Progress comes from the bus's REAL location (computed in useLiveFleet).
  // When the bus is offline we keep showing the last known position, clearly
  // marked with its age — we never pretend it is live.
  const progress = tracked?.progress ?? null;
  const hasLocation = tracked?.location != null;
  const stale = tracked != null && tracked.ageSeconds > LIVE_THRESHOLD_S;
  const completed = tracked?.status === "completed";

  const stopStatuses = useMemo(
    () => Object.fromEntries((progress?.stops ?? []).map((s) => [s.stop.id, s.status])),
    [progress],
  );

  const routeError = !loading && routes.length === 0;

  // Alerts the passenger turned on that are about to trigger: the alerted bus's
  // next stop is the alerted stop (and, when an ETA is known, it's within 5 min).
  const arriving = useMemo(
    () =>
      alerts.flatMap((a) => {
        const bus = allBuses.find((b) => b.bus.id === a.busId);
        const p = bus?.progress ?? null;
        if (!bus || !p || p.nextStop?.id !== a.stopId) return [];
        if (p.etaMinutes != null && p.etaMinutes > 5) return [];
        return [
          {
            key: `${a.busId}:${a.stopId}`,
            busNumber: a.busNumber || bus.bus.bus_number,
            stopName: a.stopName || p.nextStop.name,
            etaMinutes: p.etaMinutes,
          },
        ];
      }),
    [alerts, allBuses],
  );

  // Fire a browser notification once per arriving alert (when permitted).
  const notifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const active = new Set(arriving.map((a) => a.key));
    notifiedRef.current.forEach((k) => {
      if (!active.has(k)) notifiedRef.current.delete(k);
    });
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") void Notification.requestPermission();
    if (Notification.permission !== "granted") return;
    arriving.forEach((a) => {
      if (notifiedRef.current.has(a.key)) return;
      notifiedRef.current.add(a.key);
      new Notification(`Bus ${a.busNumber} about to arrive`, {
        body: `Arriving at ${a.stopName}${a.etaMinutes != null ? ` in about ${a.etaMinutes} min` : " shortly"}.`,
      });
    });
  }, [arriving]);


  return (
    <AppShell bare role="passenger" right={<ConnectionBadge state={connection} />}>
      <div className="relative h-[calc(100vh-57px)] w-full">
        <MapPanel
          activeBuses={visibleBuses}
          routes={routes}
          stops={stops}
          selectedRouteId={selectedRouteId || null}
          stopStatuses={stopStatuses}
          onSelectBus={setSelectedBusId}
          selectedStopId={selectedStopId}
          onSelectStop={setSelectedStopId}
          focusBus={focusBus}
          className="absolute inset-0"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-[450] p-3 sm:inset-y-0 sm:right-auto sm:w-[24rem] sm:overflow-y-auto">
          <div className="pointer-events-auto mx-auto max-w-3xl space-y-2 sm:max-w-none">
            {arriving.map((a) => (
              <div
                key={a.key}
                className="rounded-2xl border-2 border-success bg-success/15 px-4 py-3 shadow-[var(--shadow-panel)]"
              >
                <p className="text-base font-black uppercase tracking-wide text-success">
                  🔔 Bus {a.busNumber} about to arrive
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {a.stopName}
                  {a.etaMinutes != null ? ` · ~${a.etaMinutes} min` : " · arriving shortly"}
                </p>
              </div>
            ))}

            <button
              onClick={() => {
                setChoosingStop(true);
                setSelectedStopId(null);
              }}
              className="h-16 w-full rounded-2xl bg-primary text-lg font-black uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-panel)] transition hover:opacity-90 sm:text-xl"
            >
              🚌 Where is my bus?
            </button>
            <button
              onClick={() => {
                setNearMeOpen(true);
                setChoosingStop(false);
                setSelectedStopId(null);
              }}
              className="h-16 w-full rounded-2xl border-2 border-primary bg-card text-lg font-black uppercase tracking-wide text-foreground shadow-[var(--shadow-panel)] transition hover:bg-accent sm:text-xl"
            >
              📍 Stops near me
            </button>
            <div className="relative">
              <button
                onClick={() => setBusListOpen((v) => !v)}
                aria-expanded={busListOpen}
                className="flex h-14 w-full items-center justify-between gap-2 rounded-2xl border-2 border-border bg-card px-4 text-base font-black uppercase tracking-wide text-foreground shadow-[var(--shadow-panel)] transition hover:bg-accent"
              >
                <span className="truncate">
                  {tracked ? `🚌 ${tracked.bus.bus_number} · ${tracked.directionLabel}` : "🚌 Choose a bus"}
                </span>
                <ChevronDown
                  className={`size-5 shrink-0 transition-transform ${busListOpen ? "rotate-180" : ""}`}
                />
              </button>
              {busListOpen ? (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-[50vh] space-y-1 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-panel)]">
                  {allBuses.length === 0 ? (
                    <li className="px-3 py-4 text-center text-sm font-semibold text-muted-foreground">
                      {loading ? "Loading buses…" : "No buses running right now"}
                    </li>
                  ) : (
                    allBuses.map((b) => (
                      <li key={b.bus.id}>
                        <button
                          onClick={() => {
                            setRouteChoice(null);
                            setSelectedBusId(b.bus.id);
                            setSelectedStopId(null);
                            setBusListOpen(false);
                            setFocusBus({ busId: b.bus.id, token: Date.now() });
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                            b.bus.id === tracked?.bus.id
                              ? "border-primary bg-primary/10"
                              : "border-transparent hover:border-primary/40 hover:bg-accent"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-bold">
                              {b.bus.bus_number} · {b.directionLabel}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {b.isSimulated ? "Simulated" : formatAge(b.ageSeconds)}
                              {b.progress?.nextStop ? ` · Next: ${b.progress.nextStop.name}` : ""}
                            </span>
                          </span>
                          <StatusPill status={b.status} />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
            <PassengerSearch
              buses={allBusRegistry}
              routes={routes}
              stops={stops}
              activeBuses={allBuses}
              loading={loading}
              myStop={selectedStop}
              onSelectBus={(id) => {
                setRouteChoice(null);
                setSelectedBusId(id);
                setSelectedStopId(null);
              }}
              onSelectStop={(id) => setSelectedStopId(id)}
              onSelectRoute={(id) => {
                setRouteChoice(id);
                setSelectedBusId(null);
              }}
              onShowMap={() => setSelectedStopId(null)}
              onSearchingChange={setSearching}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-secondary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
                {loading ? "Loading…" : `${visibleBuses.length} active`}
              </span>
              {routeChoice ? (
                <button
                  onClick={() => setRouteChoice(null)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-accent"
                >
                  Show all routes
                </button>
              ) : null}
              <span className="sm:hidden">
                <ConnectionBadge state={connection} />
              </span>
            </div>
          </div>
        </div>


        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-[400] p-3 sm:pl-[25rem] ${
            searching ? "hidden sm:block" : ""
          }`}
        >
          <div className="pointer-events-auto mx-auto max-h-[62vh] max-w-3xl overflow-y-auto rounded-xl border border-border bg-card/95 p-3 shadow-[var(--shadow-panel)] backdrop-blur">
            {!online ? (
              <p className="mb-2 rounded-md bg-warning/20 px-2 py-1.5 text-sm font-semibold text-warning-foreground">
                No internet connection — showing the last known bus information.
              </p>
            ) : null}
            {routeError ? (
              <p className="py-2 text-sm text-destructive">
                Route could not be loaded. Please check your connection and try again.
              </p>
            ) : !tracked ? (
              <p className="py-2 text-sm text-muted-foreground">
                {loading
                  ? "Loading live buses…"
                  : "No live bus right now. Please check again in a few minutes."}
              </p>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold">
                    BUS {tracked.bus.bus_number}
                    {tracked.isSimulated ? (
                      <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-muted-foreground">
                        Sim
                      </span>
                    ) : null}
                  </h2>
                  <div className="flex items-center gap-2">
                    <StatusPill status={tracked.status} />
                    <button
                      onClick={() => setPanelCollapsed((v) => !v)}
                      aria-expanded={!panelCollapsed}
                      className="rounded-lg border border-border bg-background p-1.5 transition hover:border-primary hover:bg-accent"
                      aria-label={panelCollapsed ? "Expand bus details" : "Collapse bus details"}
                    >
                      <ChevronDown
                        className={`size-4 shrink-0 transition-transform ${panelCollapsed ? "" : "rotate-180"}`}
                      />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{tracked.directionLabel}</p>

                {!panelCollapsed ? (
                  <>
                    {stale && !completed ? (
                      <p className="mt-2 rounded-md bg-warning/20 px-2 py-1.5 text-sm font-semibold text-warning-foreground">
                        🟡 Location not updated · Last updated {formatAge(tracked.ageSeconds)}
                      </p>
                    ) : null}

                    {completed ? (
                      <p className="mt-2 rounded-md bg-success/15 px-2 py-1.5 text-sm font-semibold text-success">
                        ⚫ Trip completed — the bus has reached{" "}
                        {routeStops[routeStops.length - 1]?.name ?? "the final stop"}.
                      </p>
                    ) : !hasLocation ? (
                      <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-sm font-semibold">
                        Bus location unavailable right now.
                      </p>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <Cell label="Next stop" value={progress?.nextStop?.name ?? "—"} />
                        <Cell
                          label="Distance"
                          value={
                            progress?.nextDistanceKm != null
                              ? `${progress.nextDistanceKm.toFixed(1)} km`
                              : "—"
                          }
                        />
                        <Cell
                          label="Arriving in"
                          value={
                            progress?.etaMinutes != null ? `${progress.etaMinutes} min` : "ETA unavailable"
                          }
                        />
                        <Cell label="Last updated" value={formatAge(tracked.ageSeconds)} />
                      </div>
                    )}

                {progress && progress.totalStops > 0 ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>Trip progress</span>
                      <span>
                        {progress.completedCount} / {progress.totalStops} stops completed
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{
                          width: `${Math.round((progress.completedCount / progress.totalStops) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {routeStops.length > 0 ? (
                  <ol className="mt-3 space-y-1">
                    {(progress?.stops ??
                      routeStops.map((stop) => ({
                        stop,
                        status: "upcoming" as const,
                      }))).map((item) => {
                      const mark =
                        item.status === "passed" ? "✓" : item.status === "next" ? "→" : "○";
                      const cls =
                        item.status === "passed"
                          ? "text-success"
                          : item.status === "next"
                            ? "bg-warning/20 font-semibold"
                            : "text-muted-foreground";
                      const chosen = item.stop.id === selectedStopId;
                      return (
                        <li key={item.stop.id}>
                          <button
                            onClick={() => setSelectedStopId(item.stop.id)}
                            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-base transition ${cls} ${
                              chosen
                                ? "border-primary bg-primary/10 font-bold"
                                : "border-transparent hover:border-primary/40 hover:bg-accent"
                            }`}
                          >
                          <span className="w-4 text-center">{mark}</span>
                          <span className="flex-1 truncate">{item.stop.name}</span>
                          {item.status === "next" ? (
                            <span className="text-xs font-bold uppercase tracking-wide">
                              Next stop
                            </span>
                          ) : item.status === "final" ? (
                            <span className="text-xs uppercase tracking-wide">Final stop</span>
                          ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}

                {visibleBuses.length > 1 ? (
                  <div className="relative mt-3">
                    <button
                      onClick={() => setPanelBusListOpen((v) => !v)}
                      aria-expanded={panelBusListOpen}
                      className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 text-sm font-bold transition hover:border-primary"
                    >
                      <span className="truncate">
                        🚌 {tracked.bus.bus_number} · {tracked.directionLabel}
                      </span>
                      <ChevronDown
                        className={`size-4 shrink-0 transition-transform ${panelBusListOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {panelBusListOpen ? (
                      <ul className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-[40vh] space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-[var(--shadow-panel)]">
                        {visibleBuses.map((b) => (
                          <li key={b.bus.id}>
                            <button
                              onClick={() => {
                                setSelectedBusId(b.bus.id);
                                setPanelBusListOpen(false);
                                setFocusBus({ busId: b.bus.id, token: Date.now() });
                              }}
                              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                                b.bus.id === tracked.bus.id
                                  ? "border-primary bg-primary/5"
                                  : "border-transparent hover:border-primary/40 hover:bg-accent"
                              }`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold">
                                  {b.bus.bus_number} · {b.directionLabel}
                                </span>
                                <span className="block truncate text-muted-foreground">
                                  {b.isSimulated ? "Simulated" : formatAge(b.ageSeconds)}
                                  {b.progress?.nextStop ? ` · Next: ${b.progress.nextStop.name}` : ""}
                                </span>
                              </span>
                              <StatusPill status={b.status} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                  </>
                ) : null}
              </div>
            )}
            <div className="mt-3">
              {isDemo ? (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-warning/15 px-2.5 py-1.5 text-xs font-semibold text-warning-foreground">
                  <span>Demo Alerts Login — stored on this device only</span>
                  <button onClick={exitDemo} className="underline hover:no-underline">
                    Exit demo
                  </button>
                </div>
              ) : null}
              <MyAlerts alerts={alerts} onTurnOff={turnOff} />
            </div>
          </div>
        </div>

        {nearMeOpen ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[600] p-3 sm:inset-y-0 sm:left-auto sm:right-0 sm:flex sm:w-[26rem] sm:items-start sm:pt-20">
            <div className="pointer-events-auto max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-border bg-card/97 p-4 shadow-[var(--shadow-panel)] backdrop-blur">
              <StopsNearMeSheet
                stops={stops}
                onSelectStop={(id) => {
                  setSelectedStopId(id);
                  setNearMeOpen(false);
                }}
                onSearchStop={() => {
                  setNearMeOpen(false);
                  setChoosingStop(true);
                }}
                onClose={() => setNearMeOpen(false)}
              />
            </div>
          </div>
        ) : null}

        {choosingStop ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[600] p-3 sm:inset-y-0 sm:left-auto sm:right-0 sm:flex sm:w-[26rem] sm:items-start sm:pt-20">
            <div className="pointer-events-auto max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-border bg-card/97 p-4 shadow-[var(--shadow-panel)] backdrop-blur">
              <WhereIsMyBusSheet
                stops={stops}
                routes={routes}
                onSelectStop={(id) => {
                  setSelectedStopId(id);
                  setChoosingStop(false);
                }}
                onClose={() => setChoosingStop(false)}
              />
            </div>
          </div>
        ) : null}

        {selectedStop ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] p-3 sm:inset-y-0 sm:left-auto sm:right-0 sm:flex sm:w-[26rem] sm:items-start sm:pt-20">
            <div className="pointer-events-auto max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-border bg-card/97 p-4 shadow-[var(--shadow-panel)] backdrop-blur">
              <StopPanel
                stop={selectedStop}
                activeBuses={allBuses}
                isAlertOn={isAlertOn}
                onTurnOn={requestAlert}
                onTurnOff={turnOff}
                onTrackBus={(busId) => {
                  setRouteChoice(null);
                  setSelectedBusId(busId);
                  setFocusBus({ busId, token: Date.now() });
                }}
                onClose={() => setSelectedStopId(null)}
              />
            </div>
          </div>
        ) : null}

        {authPromptOpen ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[700] p-3 sm:inset-y-0 sm:left-auto sm:right-0 sm:flex sm:w-[26rem] sm:items-start sm:pt-20">
            <div className="pointer-events-auto max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-border bg-card/97 p-4 shadow-[var(--shadow-panel)] backdrop-blur">
              <PassengerAuthPrompt
                onClose={() => setAuthPromptOpen(false)}
                onDemoSuccess={() => {
                  setAuthPromptOpen(false);
                  const pending = pendingAlertRef.current;
                  pendingAlertRef.current = null;
                  if (pending) turnOn(pending);
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

const PASSENGER_DEMO_PHONE = "6666666666";
const PASSENGER_DEMO_OTP = "123456";

function PassengerAuthPrompt({
  onClose,
  onDemoSuccess,
}: {
  onClose: () => void;
  onDemoSuccess: () => void;
}) {
  const [showDemo, setShowDemo] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithPassword(email, password);
        onClose();
      } else {
        await signUpWithPassword(email, password, email.split("@")[0] ?? "Passenger");
        setInfo("Account created — you're signed in. Tap Alert Me again to turn the alert on.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (showDemo) {
    return (
      <PassengerDemoLogin onSuccess={onDemoSuccess} onBack={() => setShowDemo(false)} onClose={onClose} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="text-xl font-black uppercase tracking-tight">🔔 Sign in for alerts</h2>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-accent"
        >
          Close
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Bus-stop alerts need a quick sign-in so we know who to notify.
      </p>
      <div className="flex gap-2 text-sm font-semibold">
        <button
          onClick={() => setMode("signin")}
          className={`h-9 flex-1 rounded-md border ${mode === "signin" ? "border-primary bg-primary/10" : "border-border"}`}
        >
          Sign in
        </button>
        <button
          onClick={() => setMode("signup")}
          className={`h-9 flex-1 rounded-md border ${mode === "signup" ? "border-primary bg-primary/10" : "border-border"}`}
        >
          Create account
        </button>
      </div>
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
      </div>
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="h-12 w-full rounded-xl bg-primary text-base font-black text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
      {info ? <p className="text-sm font-semibold text-success">{info}</p> : null}

      <button
        type="button"
        onClick={() => setShowDemo(true)}
        className="mx-auto block text-xs text-muted-foreground hover:underline"
      >
        Presenting? Use Demo Login instead
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEMPORARY DEMO LOGIN for the Alert Me feature — entirely frontend-only. No
// Supabase Auth, no backend call. Alerts created this way are stored in
// localStorage on this device only (see hooks/useBusAlerts.ts) — they don't
// create real passenger_alerts rows and aren't triggered by real GPS.
// ---------------------------------------------------------------------------
function PassengerDemoLogin({
  onSuccess,
  onBack,
  onClose,
}: {
  onSuccess: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (phone.trim() === PASSENGER_DEMO_PHONE) {
      setError(null);
      setStep("otp");
    } else {
      setError("This phone number is not authorized for Demo Login.");
    }
  }

  function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim() === PASSENGER_DEMO_OTP) {
      setDemoPassengerSession();
      onSuccess();
    } else {
      setError("Invalid demo code. Please try again.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-warning-foreground">
          Demo Login
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-accent"
        >
          Close
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        {step === "phone"
          ? "Presentation demo only — fixed demo code, not a real SMS."
          : "Enter the fixed demo code below."}
      </p>

      {step === "phone" ? (
        <form onSubmit={sendOtp} className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            Phone number
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 6666666666"
              className="h-11 rounded-md border border-input bg-background px-3 text-sm"
              autoFocus
            />
          </label>
          <button
            type="submit"
            className="h-12 w-full rounded-xl bg-primary text-base font-black text-primary-foreground transition hover:opacity-90"
          >
            Continue
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            One-time code
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit OTP"
              className="h-11 rounded-md border border-input bg-background px-3 text-center text-lg tracking-[0.5em]"
              autoFocus
            />
          </label>
          <button
            type="submit"
            className="h-12 w-full rounded-xl bg-primary text-base font-black text-primary-foreground transition hover:opacity-90"
          >
            Verify & Continue
          </button>
        </form>
      )}

      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

      <button
        type="button"
        onClick={onBack}
        className="mx-auto block text-xs text-muted-foreground hover:underline"
      >
        Not presenting? Use real sign-in instead
      </button>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-2 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
