import { useMemo, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import type { BusStop, Route } from "@/lib/transit";

type Props = {
  stops: BusStop[];
  routes: Route[];
  onSelectStop: (stopId: string) => void;
  onClose: () => void;
};

/**
 * Frontend-only helper: lets a passenger pick one of the stops the app already
 * loaded. No new stop data is created here.
 */
export function WhereIsMyBusSheet({ stops, routes, onSelectStop, onClose }: Props) {
  const [query, setQuery] = useState("");

  const ordered = useMemo(
    () =>
      [...stops].sort(
        (a, b) =>
          (a.route_id ?? "").localeCompare(b.route_id ?? "") || a.sequence - b.sequence,
      ),
    [stops],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((s) => s.name.toLowerCase().includes(q));
  }, [ordered, query]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="text-xl font-black uppercase tracking-tight sm:text-2xl">
          Choose your bus stop
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-border hover:bg-accent"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your stop"
          autoComplete="off"
          aria-label="Search your stop"
          className="h-14 w-full rounded-xl border-2 border-input bg-background pl-11 pr-4 text-base font-medium outline-none focus:border-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-base font-semibold text-muted-foreground">
          No stop found
        </p>
      ) : (
        <ul className="max-h-[52vh] space-y-2 overflow-y-auto pr-0.5">
          {filtered.map((stop) => {
            const route = routes.find((r) => r.id === stop.route_id) ?? null;
            return (
              <li key={stop.id}>
                <button
                  onClick={() => onSelectStop(stop.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left transition hover:border-primary"
                >
                  <MapPin className="size-6 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-bold">🚏 {stop.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {route ? route.name : "Bus stop"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
