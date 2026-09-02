import { useEffect, useMemo, useState } from "react";
import { Bus as BusIcon, MapPin, Route as RouteIcon, Search, X } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { routeEndpoints, searchTransit, type BusResult } from "@/lib/passengerSearch";
import type { ActiveBus, Bus, BusStop, Route } from "@/lib/transit";

type Props = {
  buses: Bus[];
  routes: Route[];
  stops: BusStop[];
  activeBuses: ActiveBus[];
  loading: boolean;
  /** Stop the passenger last opened, offered as "My stop". */
  myStop: BusStop | null;
  onSelectBus: (busId: string) => void;
  onSelectStop: (stopId: string) => void;
  onSelectRoute: (routeId: string | null) => void;
  onShowMap: () => void;
  /** Lets the page dim other panels while results are on screen. */
  onSearchingChange?: (searching: boolean) => void;
};

export function PassengerSearch({
  buses,
  routes,
  stops,
  activeBuses,
  loading,
  myStop,
  onSelectBus,
  onSelectStop,
  onSelectRoute,
  onShowMap,
  onSearchingChange,
}: Props) {
  const [query, setQuery] = useState("");
  const { recent, remember, clear } = useRecentSearches();

  const results = useMemo(
    () => searchTransit({ query, buses, routes, stops, activeBuses }),
    [query, buses, routes, stops, activeBuses],
  );

  const searching = query.trim().length > 0;

  useEffect(() => {
    onSearchingChange?.(searching);
  }, [searching, onSearchingChange]);

  // Quick search offers only things that really exist in the loaded data.
  const quickBus = activeBuses[0]?.bus ?? buses[0] ?? null;

  function pickBus(id: string, label: string) {
    remember(label);
    setQuery("");
    onSelectBus(id);
  }
  function pickStop(id: string, label: string) {
    remember(label);
    setQuery("");
    onSelectStop(id);
  }
  function pickRoute(id: string, label: string) {
    remember(label);
    setQuery("");
    onSelectRoute(id);
  }

  return (
    <div className="rounded-2xl border border-border bg-card/95 p-3 shadow-[var(--shadow-panel)] backdrop-blur">
      <label htmlFor="transit-search" className="block pl-10 text-sm font-bold sm:pl-10">
        🔍 Where do you want to go?
      </label>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          id="transit-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try Bus 101, a stop, or destination"
          autoComplete="off"
          className="h-14 w-full rounded-xl border-2 border-input bg-background pl-11 pr-11 text-base font-medium outline-none focus:border-primary"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg hover:bg-accent"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      {!searching ? (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Quick search
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {myStop ? (
                <QuickChip
                  label={`🚏 ${myStop.name}`}
                  onClick={() => pickStop(myStop.id, myStop.name)}
                />
              ) : null}
              {quickBus ? (
                <QuickChip
                  label={`🚌 Bus ${quickBus.bus_number}`}
                  onClick={() => pickBus(quickBus.id, `Bus ${quickBus.bus_number}`)}
                />
              ) : null}
              <QuickChip
                label="🗺️ Live map"
                onClick={() => {
                  setQuery("");
                  onSelectRoute(null);
                  onShowMap();
                }}
              />
            </div>
          </div>

          {recent.length > 0 ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Recent searches
                </p>
                <button
                  onClick={clear}
                  className="rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-accent"
                >
                  Clear
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {recent.map((r) => (
                  <QuickChip key={r} label={r} onClick={() => setQuery(r)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 max-h-[52vh] space-y-4 overflow-y-auto pr-0.5">
          {results.total === 0 ? (
            <p className="rounded-xl bg-muted px-4 py-6 text-center text-base font-semibold text-muted-foreground">
              {loading ? "Loading…" : "No buses or stops found"}
            </p>
          ) : null}

          {results.buses.length > 0 ? (
            <Group title="Buses">
              {results.buses.map((r) => (
                <BusResultCard
                  key={r.id}
                  result={r}
                  onView={() => pickBus(r.bus.id, `Bus ${r.bus.bus_number}`)}
                />
              ))}
            </Group>
          ) : null}

          {results.stops.length > 0 ? (
            <Group title="Stops">
              {results.stops.map((r) => (
                <button
                  key={r.id}
                  onClick={() => pickStop(r.stop.id, r.stop.name)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left transition hover:border-primary"
                >
                  <MapPin className="size-6 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-bold">🚏 {r.stop.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {r.route ? r.route.name : "Bus stop"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold uppercase text-primary">See buses</span>
                </button>
              ))}
            </Group>
          ) : null}

          {results.routes.length > 0 ? (
            <Group title="Routes">
              {results.routes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => pickRoute(r.route.id, r.route.name)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left transition hover:border-primary"
                >
                  <RouteIcon className="size-6 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-bold">🛣️ {r.route.code}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {routeEndpoints(r.stops) ?? r.route.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold uppercase text-primary">View</span>
                </button>
              ))}
            </Group>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function QuickChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition hover:border-primary hover:bg-accent"
    >
      {label}
    </button>
  );
}

function BusResultCard({ result, onView }: { result: BusResult; onView: () => void }) {
  const live = result.live;
  const progress = live?.progress ?? null;
  const direction = progress ? routeEndpoints(progress.stops.map((s) => s.stop)) : null;

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xl font-black tracking-tight">
            <BusIcon className="size-5 shrink-0 text-primary" />
            BUS {result.bus.bus_number}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {direction ?? result.route?.name ?? "Route not assigned"}
          </p>
        </div>
        {live ? (
          <StatusPill status={live.status} />
        ) : (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Not running
          </span>
        )}
      </div>

      {live ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-[11px] font-semibold uppercase text-muted-foreground">Next stop</dt>
            <dd className="truncate font-bold">{progress?.nextStop?.name ?? "—"}</dd>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
              Arriving in
            </dt>
            <dd className="font-bold">
              {progress?.etaMinutes != null ? `${progress.etaMinutes} min` : "Not available"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-muted-foreground">
          No live location right now
        </p>
      )}

      <button
        onClick={onView}
        className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-base font-bold uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
      >
        View bus
      </button>
    </div>
  );
}
