import { createFileRoute, Link } from "@tanstack/react-router";
import { Bus, MapPin, Settings2, User } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TransitTrack — Live City Bus Tracking" },
      {
        name: "description",
        content:
          "Choose how you want to use TransitTrack: track buses as a passenger, run your trip as a driver, or monitor the fleet as an administrator.",
      },
      { property: "og:title", content: "TransitTrack — Live City Bus Tracking" },
      {
        property: "og:description",
        content:
          "Passenger, Driver and Admin experiences for real-time city bus tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const ROLES = [
  {
    to: "/passenger",
    emoji: "👤",
    icon: MapPin,
    title: "Passenger",
    text: "Find and track buses",
  },
  {
    to: "/driver",
    emoji: "🧑‍✈️",
    icon: Bus,
    title: "Driver",
    text: "Manage your bus trip",
  },
  {
    to: "/admin",
    emoji: "🛠️",
    icon: Settings2,
    title: "Admin",
    text: "Monitor and manage the transport system",
  },
] as const;

function Index() {
  return (
    <div className="tt-page-glow flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-10 sm:py-16">
        <header className="text-center">
          <span className="tt-brand-mark mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--brand-deep)] text-primary-foreground shadow-lg">
            <Bus className="size-7" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold uppercase tracking-wider sm:text-5xl">
            🚌 TransitTrack
          </h1>
          <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-accent" />
          <span className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            Live tracking
          </span>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Choose how you want to use TransitTrack
          </p>
        </header>

        <nav className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="tt-role-card group flex min-h-[10rem] flex-col rounded-2xl border border-border bg-card/95 p-6 text-left shadow-[var(--shadow-panel)] backdrop-blur-sm transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span aria-hidden className="text-4xl">
                {r.emoji}
              </span>
              <h2 className="mt-4 flex items-center gap-2 text-xl font-bold sm:text-2xl">
                <r.icon className="size-5 shrink-0 text-primary" />
                {r.title}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{r.text}</p>
              <span className="mt-auto pt-4 text-sm font-semibold uppercase tracking-wide text-primary">
                Open →
              </span>
            </Link>
          ))}
        </nav>
      </main>
      <footer className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        Real-time public transport tracking
      </footer>
    </div>
  );
}
