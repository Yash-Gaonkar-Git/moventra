import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LogOut } from "lucide-react";
import { AppShell, ConnectionBadge } from "@/components/AppShell";
import { MapPanel } from "@/components/MapPanel";
import { StatusPill } from "./passenger";
import { DriverApprovals } from "@/components/DriverApprovals";
import { useLiveFleet } from "@/hooks/useLiveFleet";
import { useSimulation } from "@/hooks/useSimulation";
import { clearDemoSession, getDemoSession, setDemoSession, type DemoSessionKind } from "@/lib/demoSession";
import {
  formatAge,
  isAdminSession,
  kmh,
  onAuthStateChange,
  sendEmailOtp,
  signOut,
  verifyEmailOtp,
} from "@/lib/transit";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Fleet Control Room — TransitTrack Admin" },
      {
        name: "description",
        content:
          "Monitor the whole city bus fleet: total, active, delayed and offline buses with live speed, route and last-update telemetry.",
      },
      { property: "og:title", content: "Fleet Control Room — TransitTrack Admin" },
      {
        property: "og:description",
        content: "Live operations dashboard for city bus fleet monitoring.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

type AuthState = "checking" | "signed-out" | "forbidden" | "admin";

/**
 * Route-level guard. The dashboard (and everything in it — live fleet data,
 * driver approvals) only mounts once a real Supabase session is confirmed to
 * carry app_metadata.role === "admin". There is no other way in: no
 * hardcoded phone number, no fixed code. That claim can only be set via the
 * Supabase Auth Admin API — never by the client, not even by the admin's own
 * session.
 */
function AdminPage() {
  const [demoSession, setDemoSessionState] = useState<DemoSessionKind | null>(() => getDemoSession());
  const [showDemoLogin, setShowDemoLogin] = useState(false);
  const [state, setState] = useState<AuthState>("checking");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((session) => {
      if (!session) {
        setState("signed-out");
        setEmail(null);
        return;
      }
      setEmail(session.user.email ?? null);
      setState(isAdminSession(session) ? "admin" : "forbidden");
    });
    return unsubscribe;
  }, []);

  // Temporary presentation-demo path — entirely frontend-only, no Supabase
  // Auth, no backend call. See lib/demoSession.ts.
  if (demoSession === "demo_admin") {
    return (
      <AdminDashboard
        isDemo
        onDemoLogout={() => {
          clearDemoSession();
          setDemoSessionState(null);
        }}
      />
    );
  }

  if (showDemoLogin) {
    return (
      <AdminDemoLogin
        onSuccess={() => {
          setDemoSession("demo_admin");
          setDemoSessionState("demo_admin");
        }}
        onBack={() => setShowDemoLogin(false)}
      />
    );
  }

  if (state === "checking") {
    return (
      <AppShell role="admin">
        <div className="mx-auto w-full max-w-xl py-16 text-center text-sm text-muted-foreground">
          Checking your session…
        </div>
      </AppShell>
    );
  }

  if (state === "signed-out") return <AdminSignIn onDemoLogin={() => setShowDemoLogin(true)} />;
  if (state === "forbidden") return <AdminForbidden email={email} />;
  return <AdminDashboard />;
}

/** Real Supabase email OTP sign-in — a genuine 6-digit code sent to the admin's real inbox, verified server-side. Not a hardcoded credential. */
function AdminSignIn({ onDemoLogin }: { onDemoLogin: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setError(null);
    if (!email) {
      setError("Enter your admin email address.");
      return;
    }
    setBusy(true);
    try {
      await sendEmailOtp(email);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (!code) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      await verifyEmailOtp(email, code);
      // onAuthStateChange in AdminPage picks up the new session and
      // re-evaluates admin/forbidden automatically.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid or expired code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell role="admin">
      <div className="mx-auto w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Admin sign-in</h1>
          <p className="text-sm text-muted-foreground">
            {step === "email"
              ? "Enter an authorized admin email — we'll send a real 6-digit code, no password needed."
              : `Enter the code sent to ${email}.`}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
          {step === "email" ? (
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <button
                onClick={() => void sendCode()}
                disabled={busy}
                className="mt-1 h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send code"}
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                6-digit code
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                  className="h-11 rounded-md border border-input bg-background px-3 text-center text-lg tracking-[0.5em]"
                />
              </label>
              <button
                onClick={() => void verify()}
                disabled={busy}
                className="mt-1 h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Verifying…" : "Verify & sign in"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="text-xs text-muted-foreground hover:underline"
              >
                Use a different email
              </button>
            </div>
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
          onClick={onDemoLogin}
          className="mx-auto block text-xs text-muted-foreground hover:underline"
        >
          Presenting? Use Demo Admin Login instead
        </button>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// TEMPORARY DEMO ADMIN LOGIN — entirely frontend-only. No Supabase Auth, no
// email, no real OTP, no backend call of any kind. See lib/demoSession.ts.
// ---------------------------------------------------------------------------
const ADMIN_DEMO_PHONE = "9999999999";
const ADMIN_DEMO_OTP = "123456";

function AdminDemoLogin({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (phone.trim() === ADMIN_DEMO_PHONE) {
      setError(null);
      setStep("otp");
    } else {
      setError("This phone number is not authorized for Demo Admin Login.");
    }
  }

  function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim() === ADMIN_DEMO_OTP) {
      onSuccess();
    } else {
      setError("Invalid demo code. Please try again.");
    }
  }

  return (
    <AppShell role="admin">
      <div className="mx-auto w-full max-w-sm space-y-4">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-warning-foreground">
          Demo Admin Login
        </div>
        <div>
          <h1 className="text-2xl font-bold">Demo Admin Login</h1>
          <p className="text-sm text-muted-foreground">
            {step === "phone"
              ? "Presentation demo only — this is a fixed demo code, not a real SMS or email."
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
                  placeholder="e.g. 9999999999"
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
          onClick={onBack}
          className="mx-auto block text-xs text-muted-foreground hover:underline"
        >
          Not presenting? Use real admin sign-in instead
        </button>
      </div>
    </AppShell>
  );
}

function AdminForbidden({ email }: { email: string | null }) {
  return (
    <AppShell
      role="admin"
      right={
        <button
          onClick={() => void signOut()}
          className="inline-flex items-center gap-1 rounded border border-white/25 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-white/10"
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      }
    >
      <div className="mx-auto w-full max-w-md space-y-4 py-12">
        <div className="flex justify-end sm:hidden">
          <button
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-accent"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {email ? `${email} is` : "This account is"} signed in but not authorized for the Fleet
            Control Room. Admin access is granted separately and can't be self-assigned.
          </span>
        </div>
      </div>
    </AppShell>
  );
}

function AdminDashboard({
  isDemo = false,
  onDemoLogout,
}: {
  isDemo?: boolean;
  onDemoLogout?: () => void;
}) {
  const { activeBuses, routes, stops, buses, connection } = useLiveFleet();

  const realRoute = routes[0] ?? null;
  const realRouteStops = useMemo(
    () =>
      realRoute
        ? stops.filter((s) => s.route_id === realRoute.id).sort((a, b) => a.sequence - b.sequence)
        : [],
    [stops, realRoute],
  );
  const sim = useSimulation(realRouteStops, realRoute);

  // Bus 101 (real) and 102–110 (simulated) shown together, exactly as the
  // rest of the app already renders any ActiveBus[] — merged only here at
  // the presentation layer. The simulation never touches activeBuses' real
  // Supabase-sourced data.
  const allBuses = useMemo(() => [...activeBuses, ...sim.simulatedBuses], [activeBuses, sim.simulatedBuses]);

  const live = allBuses.filter((b) => b.status === "live").length;
  const delayed = allBuses.filter((b) => b.status === "delayed").length;
  const completed = allBuses.filter((b) => b.status === "completed").length;
  const offline = buses.length + sim.simulatedBusRegistry.length - live - delayed - completed;

  const handleSignOut = isDemo && onDemoLogout ? onDemoLogout : () => void signOut();

  return (
    <AppShell
      role="admin"
      right={
        <div className="flex items-center gap-2">
          {isDemo ? (
            <span className="rounded-full bg-warning/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-warning-foreground">
              Demo Admin Login
            </span>
          ) : (
            <ConnectionBadge state={connection} />
          )}
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1 rounded border border-white/25 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-white/10"
          >
            <LogOut className="size-3.5" /> {isDemo ? "Exit demo" : "Sign out"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 sm:hidden">
          {isDemo ? (
            <span className="rounded-full bg-warning/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-warning-foreground">
              Demo Admin Login
            </span>
          ) : (
            <ConnectionBadge state={connection} />
          )}
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            <LogOut className="size-3.5" /> {isDemo ? "Exit demo" : "Sign out"}
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Fleet Control Room</h1>
          <p className="text-sm text-muted-foreground">
            Live operational view of every bus registered in the city network.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Total buses" value={buses.length + sim.simulatedBusRegistry.length} tone="neutral" />
          <Kpi label="Active / live" value={live} tone="success" />
          <Kpi label="Delayed signal" value={delayed} tone="warning" />
          <Kpi label="Offline" value={Math.max(0, offline)} tone="muted" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="h-[420px] overflow-hidden rounded-xl border border-border shadow-[var(--shadow-panel)]">
            <MapPanel activeBuses={allBuses} routes={routes} stops={stops} />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)]">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">
              Active trips ({allBuses.length})
            </div>
            <div className="max-h-[370px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Bus</th>
                    <th className="px-3 py-2">Direction</th>
                    <th className="px-3 py-2">Speed</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allBuses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        No active trips. Start a trip from Driver Mode, or start the simulation
                        below.
                      </td>
                    </tr>
                  ) : (
                    allBuses.map((b) => (
                      <tr key={b.bus.id} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">
                          {b.bus.bus_number}
                          {b.isSimulated ? (
                            <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                              Sim
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{b.directionLabel}</td>
                        <td className="px-3 py-2">{kmh(b.avgSpeedMs)}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {b.isSimulated ? "live" : formatAge(b.ageSeconds)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={b.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <SimulationPanel
          running={sim.running}
          start={sim.start}
          stop={sim.stop}
          simulatedBuses={sim.simulatedBuses}
          roadPathReady={sim.roadPathReady}
        />

        {isDemo ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Demo Admin Login has no real backend session, so Driver Approvals below can't load
              or change real driver data — that specifically requires real admin sign-in. Fleet
              overview and simulation controls above are fully live either way.
            </span>
          </div>
        ) : null}

        <DriverApprovals />
      </div>
    </AppShell>
  );
}

function SimulationPanel({
  running,
  start,
  stop,
  simulatedBuses,
  roadPathReady,
}: {
  running: boolean;
  start: () => void;
  stop: () => void;
  simulatedBuses: ReturnType<typeof useSimulation>["simulatedBuses"];
  roadPathReady: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Bus Simulation (Demo)</h2>
          <p className="text-sm text-muted-foreground">
            Controls only buses 102–110 — Bus 101 stays fully independent, driven for real from
            Driver Mode.
          </p>
        </div>
        <button
          onClick={running ? stop : start}
          className={`h-11 shrink-0 rounded-md px-4 text-sm font-bold uppercase tracking-wide transition ${
            running
              ? "border border-destructive text-destructive hover:bg-destructive/10"
              : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          {running ? "⏹ Stop bus simulation" : "▶ Start bus simulation"}
        </button>
      </div>

      {running ? (
        <div className="mt-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-success">
            <span className="size-2 animate-pulse rounded-full bg-success" /> Simulation running
          </span>
          <div className="mt-3 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Bus</th>
                  <th className="px-2 py-1.5">Direction</th>
                  <th className="px-2 py-1.5">Current stop</th>
                  <th className="px-2 py-1.5">Next stop</th>
                  <th className="px-2 py-1.5">Speed</th>
                  <th className="px-2 py-1.5">ETA</th>
                  <th className="px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {simulatedBuses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">
                      {roadPathReady ? "Buses departing shortly…" : "Loading real road route geometry…"}
                    </td>
                  </tr>
                ) : (
                  simulatedBuses.map((b) => {
                    const current = [...(b.progress?.stops ?? [])].reverse().find((s) => s.status === "passed");
                    return (
                      <tr key={b.bus.id} className="border-t border-border">
                        <td className="px-2 py-1.5 font-semibold">{b.bus.bus_number}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{b.directionLabel}</td>
                        <td className="px-2 py-1.5">{current?.stop.name ?? "—"}</td>
                        <td className="px-2 py-1.5">{b.progress?.nextStop?.name ?? "—"}</td>
                        <td className="px-2 py-1.5">{kmh(b.avgSpeedMs)}</td>
                        <td className="px-2 py-1.5">
                          {b.progress?.etaMinutes != null ? `${b.progress.etaMinutes} min` : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <StatusPill status={b.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "muted";
}) {
  const toneCls = {
    neutral: "text-primary",
    success: "text-success",
    warning: "text-warning-foreground",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 font-display text-3xl font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}
