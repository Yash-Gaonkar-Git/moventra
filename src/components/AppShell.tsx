import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Bus, ChevronLeft, Radio, WifiOff } from "lucide-react";
import type { ConnectionState } from "@/hooks/useLiveFleet";

export type ShellRole = "passenger" | "driver" | "admin";

const ROLE_LABEL: Record<ShellRole, string> = {
  passenger: "Passenger",
  driver: "Driver",
  admin: "Admin",
};


export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const map = {
    connecting: { text: "Connecting", cls: "bg-warning/15 text-warning-foreground" },
    connected: { text: "Realtime", cls: "bg-success/15 text-success" },
    error: { text: "Offline", cls: "bg-destructive/15 text-destructive" },
  } as const;
  const s = map[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${s.cls}`}
    >
      {state === "error" ? <WifiOff className="size-3" /> : <Radio className="size-3" />}
      {s.text}
    </span>
  );
}

export function AppShell({
  children,
  right,
  bare,
  role,
}: {
  children: ReactNode;
  right?: ReactNode;
  bare?: boolean;
  role?: ShellRole;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-[500] border-b border-border bg-[var(--brand-deep)] text-primary-foreground">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded bg-accent text-accent-foreground">
              <Bus className="size-4" />
            </span>
            <span className="truncate font-display text-lg font-bold uppercase tracking-wider">
              MOVENTRA
            </span>
            {role ? (
              <span className="hidden shrink-0 rounded bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide sm:inline">
                {ROLE_LABEL[role]}
              </span>
            ) : null}
          </Link>
          <div className="flex items-center gap-2">
            {right ? <div className="hidden sm:block">{right}</div> : null}
            <Link
              to="/"
              className="inline-flex shrink-0 items-center gap-1 rounded border border-white/25 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition hover:bg-white/10"
            >
              <ChevronLeft className="size-3.5" /> Home
            </Link>
          </div>
        </div>
      </header>

      <main className={bare ? "flex-1" : "mx-auto w-full max-w-7xl flex-1 px-4 py-5"}>
        {children}
      </main>
    </div>
  );
}
