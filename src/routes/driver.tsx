import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, LocateFixed, LogOut, Play, Square } from "lucide-react";
import { AppShell, ConnectionBadge } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { clearDemoSession, getDemoSession, setDemoSession, type DemoSessionKind } from "@/lib/demoSession";
import {
  fetchActiveTrips,
  fetchFleet,
  fetchMyDriverProfile,
  kmh,
  onAuthStateChange,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  type Bus,
  type DriverProfile,
  type Route as BusRoute,
} from "@/lib/transit";

export const Route = createFileRoute("/driver")({
  head: () => ({
    meta: [
      { title: "Driver Mode — MOVENTRA GPS Broadcaster" },
      {
        name: "description",
        content:
          "Start a trip and turn your phone into a live bus GPS tracker. Broadcasts real latitude and longitude every few seconds.",
      },
      { property: "og:title", content: "Driver Mode — MOVENTRA" },
      {
        property: "og:description",
        content: "Broadcast your bus position live from the driver's smartphone browser.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DriverPage,
});

const UPLOAD_INTERVAL_MS = 4000;
const POOR_ACCURACY_M = 50;

type Fix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  at: number;
};

function DriverPage() {
  const [demoSession, setDemoSessionState] = useState<DemoSessionKind | null>(() => getDemoSession());
  const [skipDemo, setSkipDemo] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((session) => {
      setUserId(session?.user?.id ?? null);
      setCheckingAuth(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!userId) {
      setDriverProfile(null);
      return;
    }
    let cancelled = false;
    fetchMyDriverProfile()
      .then((p) => !cancelled && setDriverProfile(p))
      .catch(() => !cancelled && setDriverProfile(null));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Temporary presentation-demo path — entirely frontend-only, no Supabase
  // Auth, no backend call. See lib/demoSession.ts.
  if (demoSession === "demo_driver_101") {
    return (
      <DemoDriverConsole
        onExit={() => {
          clearDemoSession();
          setDemoSessionState(null);
        }}
      />
    );
  }

  if (!skipDemo) {
    return (
      <DriverDemoLogin
        onSuccess={() => {
          setDemoSession("demo_driver_101");
          setDemoSessionState("demo_driver_101");
        }}
        onSkip={() => setSkipDemo(true)}
      />
    );
  }

  if (checkingAuth) {
    return (
      <AppShell role="driver">
        <div className="mx-auto w-full max-w-xl py-16 text-center text-sm text-muted-foreground">
          Checking your session…
        </div>
      </AppShell>
    );
  }

  if (!userId) {
    return <DriverRealSignIn />;
  }

  return <DriverConsole driverId={userId} driverProfile={driverProfile} />;
}

// ---------------------------------------------------------------------------
// The demo phone/OTP screen above is cosmetic-only and never touches the
// backend (see its own comment). Real GPS/trip writes require a genuine
// Supabase session + an approved drivers row, so this step actually
// establishes one, using the same real email/password auth already used
// elsewhere in the app. Without this, Driver Mode dead-ends here with no way
// to actually start a trip.
// ---------------------------------------------------------------------------
function DriverRealSignIn() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
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
      } else {
        if (!fullName) {
          setError("Enter your full name.");
          setBusy(false);
          return;
        }
        await signUpWithPassword(email, password, fullName);
        setInfo(
          "Account created. Your driver account starts inactive until an admin activates it — you'll be able to start a trip once that's done.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell role="driver">
      <div className="mx-auto w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Driver account sign-in</h1>
          <p className="text-sm text-muted-foreground">
            One more step: sign in with your real driver account to start broadcasting GPS.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
          <div className="mb-3 flex gap-2 text-sm font-semibold">
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
            {mode === "signup" ? (
              <label className="grid gap-1.5 text-sm font-medium">
                Full name
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. R. Patil"
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            ) : null}
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
            className="mt-4 h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {info ? (
          <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-success">
            {info}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Demo-only driver login gate (college/demo build). Frontend-only check with
// fixed demo credentials — no SMS, no Supabase OTP, no passwords. The real
// backend driver authorization (authenticated session + drivers.is_active)
// is unchanged and still enforced after this gate.
// ---------------------------------------------------------------------------
const DRIVER_DEMO_PHONE = "8888888888";
const DRIVER_DEMO_OTP = "123456";

function DriverDemoLogin({ onSuccess, onSkip }: { onSuccess: () => void; onSkip: () => void }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (phone.trim() === DRIVER_DEMO_PHONE) {
      setError(null);
      setStep("otp");
    } else {
      setError("This phone number is not authorized for Driver Mode.");
    }
  }

  function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim() === DRIVER_DEMO_OTP) {
      onSuccess();
    } else {
      setError("Invalid OTP. Please try again.");
    }
  }

  return (
    <AppShell role="driver">
      <div className="mx-auto w-full max-w-sm space-y-4">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-warning-foreground">
          Demo Login
        </div>
        <div>
          <h1 className="text-2xl font-bold">Demo Driver Login — Bus 101</h1>
          <p className="text-sm text-muted-foreground">
            {step === "phone"
              ? "Presentation demo only — this is a fixed demo code, not a real SMS."
              : "Enter the fixed demo code below."}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
          {step === "phone" ? (
            <form onSubmit={sendOtp} className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                Phone number
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 8888888888"
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                  autoFocus
                />
              </label>
              <button
                type="submit"
                className="mt-1 h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90"
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
                className="mt-1 h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Verify & Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setError(null);
                }}
                className="text-xs text-muted-foreground hover:underline"
              >
                Use a different phone number
              </button>
            </form>
          )}
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSkip}
          className="mx-auto block text-xs text-muted-foreground hover:underline"
        >
          Not presenting? Sign in with a real driver account instead
        </button>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// TEMPORARY DEMO DRIVER CONSOLE — BUS 101
// ---------------------------------------------------------------------------
// Entirely frontend-only: no Supabase Auth, no trips/live_locations writes,
// no RLS interaction of any kind. It uses the real device GPS API purely for
// realistic telemetry display during the presentation — nothing is sent
// anywhere. This never touches the real Bus 101 pipeline (that's
// DriverConsole below, unmodified), so it can never appear on the real
// passenger map or affect real backend data.
// ---------------------------------------------------------------------------
type DemoDirection = "forward" | "reverse";

function DemoDriverConsole({ onExit }: { onExit: () => void }) {
  const [direction, setDirection] = useState<DemoDirection>("forward");
  const [active, setActive] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  const stopWatch = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);
  useEffect(() => () => stopWatch(), [stopWatch]);

  const startTrip = useCallback(() => {
    setError(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("This device/browser does not support GPS geolocation.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
          at: Date.now(),
        });
        setActive(true);
        watchId.current = navigator.geolocation.watchPosition(
          (p) =>
            setFix({
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              accuracy: p.coords.accuracy ?? null,
              speed: p.coords.speed ?? null,
              heading: p.coords.heading ?? null,
              at: Date.now(),
            }),
          (geoErr) => setError(geoMessage(geoErr)),
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 27000 },
        );
      },
      (geoErr) => setError(geoMessage(geoErr)),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }, []);

  const stopTrip = useCallback(() => {
    stopWatch();
    setActive(false);
  }, [stopWatch]);

  return (
    <AppShell
      role="driver"
      right={
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1 rounded border border-white/25 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-white/10"
        >
          <LogOut className="size-3.5" /> Exit demo
        </button>
      }
    >
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-warning-foreground">
            Demo Mode
          </span>
          <button
            onClick={onExit}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            <LogOut className="size-3.5" /> Exit demo
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="mb-1 hidden items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-warning-foreground sm:inline-flex">
              Demo Mode
            </div>
            <h1 className="text-2xl font-bold">Demo Driver Login — Bus 101</h1>
            <p className="text-sm text-muted-foreground">
              Presentation demo only — this does not broadcast to real passengers.
            </p>
          </div>
          {active ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-success">
              <span className="size-2 animate-pulse rounded-full bg-success" /> Live
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Idle
            </span>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Bus
              <input
                value="101"
                readOnly
                className="h-11 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
              />
            </label>
            <div className="grid gap-1.5 text-sm font-medium">
              Direction
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={active}
                  onClick={() => setDirection("forward")}
                  className={`h-11 flex-1 rounded-md border text-sm font-semibold transition disabled:opacity-60 ${direction === "forward" ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  Bicholim → AIEM
                </button>
                <button
                  type="button"
                  disabled={active}
                  onClick={() => setDirection("reverse")}
                  className={`h-11 flex-1 rounded-md border text-sm font-semibold transition disabled:opacity-60 ${direction === "reverse" ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  AIEM → Bicholim
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={startTrip}
              disabled={active}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <Play className="size-4" /> Start Trip
            </button>
            <button
              onClick={stopTrip}
              disabled={!active}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-destructive text-sm font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <Square className="size-4" /> Stop Trip
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <LocateFixed className="size-4 text-primary" /> Live GPS telemetry (this device)
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Latitude" value={fix ? fix.lat.toFixed(6) : "—"} />
            <Stat label="Longitude" value={fix ? fix.lng.toFixed(6) : "—"} />
            <Stat
              label="Accuracy"
              value={fix?.accuracy != null ? `±${Math.round(fix.accuracy)} m` : "—"}
            />
            <Stat label="Speed" value={kmh(fix?.speed)} />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Demo mode — this reads your device's real GPS for display only. Nothing is sent to
            the server, and it will not appear on the real passenger map.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function DriverConsole({
  driverId,
  driverProfile,
}: {
  driverId: string;
  driverProfile: DriverProfile | null;
}) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [busId, setBusId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [tripId, setTripId] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);

  const watchId = useRef<number | null>(null);
  const fixRef = useRef<Fix | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tripRef = useRef<string | null>(null);
  const busIdRef = useRef<string>("");
  busIdRef.current = busId;

  useEffect(() => {
    fetchFleet()
      .then(({ buses: b, routes: r }) => {
        setBuses(b);
        setRoutes(r);
      })
      .catch(() => setError("Could not load buses and routes."));
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const stopWatch = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopWatch(), [stopWatch]);

  const pushLocation = useCallback(async () => {
    const current = fixRef.current;
    const trip = tripRef.current;
    const bus = busIdRef.current;
    if (!current || !trip || !bus) return;
    // Real schema only stores latitude/longitude/recorded_at — no
    // accuracy/speed/heading columns, so those stay local-only telemetry.
    const { error: err } = await supabase.from("live_locations").insert({
      bus_id: bus,
      trip_id: trip,
      latitude: current.lat,
      longitude: current.lng,
      recorded_at: new Date(current.at).toISOString(),
    });
    if (err) {
      setError(`Upload failed: ${err.message}`);
    } else {
      setError(null);
      setSentCount((c) => c + 1);
      setLastSentAt(Date.now());
    }
  }, []);

  const stopTrip = useCallback(
    async (reason?: string) => {
      const trip = tripRef.current;
      stopWatch();
      tripRef.current = null;
      setTripId(null);
      setFix(null);
      fixRef.current = null;
      if (trip) {
        const { error: err } = await supabase
          .from("trips")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", trip)
          .eq("status", "active");
        if (err) setError(`Could not close trip: ${err.message}`);
        else setInfo(reason ?? "Trip ended. GPS broadcasting stopped.");
      }
    },
    [stopWatch],
  );

  // If the backend auto-completes this trip (bus really reached the final
  // stop) or it's otherwise stopped/cancelled remotely, stop broadcasting
  // instead of continuing to hit an RLS-denied insert every few seconds.
  useEffect(() => {
    const channel = supabase
      .channel(`driver-trip-${driverId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `driver_id=eq.${driverId}` },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.id === tripRef.current && row.status !== "active") {
            void stopTrip(
              row.status === "completed"
                ? "Trip completed — the bus reached its final stop."
                : "Trip was ended remotely.",
            );
          }
        },
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [driverId, stopTrip]);

  const startTrip = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!driverProfile?.is_active) {
      setError("Your driver account is not yet active. Contact an admin to activate it.");
      return;
    }
    if (!busId || !routeId) {
      setError("Select a bus and a route first.");
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("This device/browser does not support GPS geolocation.");
      return;
    }
    setBusy(true);
    try {
      const active = await fetchActiveTrips();
      if (active.some((t) => t.bus_id === busId)) {
        setError("This bus already has an active trip. Stop it before starting a new one.");
        setBusy(false);
        return;
      }

      // Ask for GPS permission and get the first real fix before creating the trip.
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      });

      const { data, error: err } = await supabase
        .from("trips")
        .insert({
          bus_id: busId,
          route_id: routeId,
          driver_id: driverId,
          status: "active",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (err || !data) {
        setError(
          err?.code === "23505"
            ? "This bus already has an active trip."
            : `Could not start trip: ${err?.message ?? "unknown error"}`,
        );
        setBusy(false);
        return;
      }

      tripRef.current = data.id;
      setTripId(data.id);
      const first: Fix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        speed: position.coords.speed ?? null,
        heading: position.coords.heading ?? null,
        at: Date.now(),
      };
      fixRef.current = first;
      setFix(first);
      await pushLocation();

      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const next: Fix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            speed: pos.coords.speed ?? null,
            heading: pos.coords.heading ?? null,
            at: Date.now(),
          };
          fixRef.current = next;
          setFix(next);
        },
        (geoErr) => setError(geoMessage(geoErr)),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 27000 },
      );
      timerRef.current = setInterval(() => void pushLocation(), UPLOAD_INTERVAL_MS);
      setInfo("Trip started. Keep this screen open while driving.");
    } catch (e) {
      const geoErr = e as GeolocationPositionError;
      setError(geoErr?.code ? geoMessage(geoErr) : "Could not start the trip. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [busId, routeId, driverId, driverProfile, pushLocation]);

  const poorAccuracy = fix?.accuracy != null && fix.accuracy > POOR_ACCURACY_M;
  const active = tripId !== null;

  return (
    <AppShell
      role="driver"
      right={
        <div className="flex items-center gap-2">
          <ConnectionBadge state={online ? "connected" : "error"} />
          <button
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1 rounded border border-white/25 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-white/10"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-xl space-y-4">
        {/* AppShell's `right` slot (sign-out) is desktop-only, and drivers are
            primarily on mobile — so also expose it inline here. */}
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <span className="truncate text-xs text-muted-foreground">
            {driverProfile?.full_name ?? "Signed in"}
          </span>
          <button
            onClick={() => void signOut()}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide hover:bg-accent"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Driver Mode</h1>
            <p className="text-sm text-muted-foreground">
              Your phone's GPS is the bus tracker. No simulated positions.
            </p>
          </div>
          {active ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-success">
              <span className="size-2 animate-pulse rounded-full bg-success" /> Live
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Idle
            </span>
          )}
        </div>

        {driverProfile && !driverProfile.is_active ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/15 p-3 text-sm text-warning-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Your driver account ({driverProfile.full_name}) is not yet active. Contact an admin to
              activate it before starting a trip.
            </span>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Bus ID
              <select
                value={busId}
                disabled={active}
                onChange={(e) => setBusId(e.target.value)}
                className="h-11 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              >
                <option value="">Select bus…</option>
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bus_number}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Route
              <select
                value={routeId}
                disabled={active}
                onChange={(e) => setRouteId(e.target.value)}
                className="h-11 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              >
                <option value="">Select route…</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Driver
              <input
                value={driverProfile?.full_name ?? ""}
                readOnly
                className="h-11 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
              />
            </label>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => void startTrip()}
              disabled={active || busy || !driverProfile?.is_active}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <Play className="size-4" /> {busy ? "Starting…" : "Start Trip"}
            </button>
            <button
              onClick={() => void stopTrip()}
              disabled={!active}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-destructive text-sm font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <Square className="size-4" /> Stop Trip
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {info && !error ? (
          <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-success">
            {info}
          </div>
        ) : null}
        {poorAccuracy ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/15 p-3 text-sm text-warning-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Weak GPS accuracy (±{Math.round(fix!.accuracy!)} m). Move near a window or outdoors for
              a better fix.
            </span>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <LocateFixed className="size-4 text-primary" /> Live GPS telemetry
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Latitude" value={fix ? fix.lat.toFixed(6) : "—"} />
            <Stat label="Longitude" value={fix ? fix.lng.toFixed(6) : "—"} />
            <Stat
              label="Accuracy"
              value={fix?.accuracy != null ? `±${Math.round(fix.accuracy)} m` : "—"}
            />
            <Stat label="Speed" value={kmh(fix?.speed)} />
            <Stat label="Points sent" value={String(sentCount)} />
            <Stat
              label="Last upload"
              value={lastSentAt ? new Date(lastSentAt).toLocaleTimeString() : "—"}
            />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Uploading every {UPLOAD_INTERVAL_MS / 1000}s while a trip is active.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold">{value}</dd>
    </div>
  );
}

function geoMessage(err: GeolocationPositionError) {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "GPS permission denied. Allow location access for this site in your browser settings, then start the trip again.";
    case err.POSITION_UNAVAILABLE:
      return "GPS position unavailable. Check that location services are switched on.";
    case err.TIMEOUT:
      return "Timed out waiting for a GPS fix. Move to an open area and retry.";
    default:
      return "Unable to read GPS location.";
  }
}
