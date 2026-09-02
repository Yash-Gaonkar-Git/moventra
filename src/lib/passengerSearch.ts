import type { ActiveBus, Bus, BusStop, Route } from "@/lib/transit";

export type BusResult = {
  kind: "bus";
  id: string;
  bus: Bus;
  route: Route | null;
  live: ActiveBus | null;
};

export type StopResult = { kind: "stop"; id: string; stop: BusStop; route: Route | null };
export type RouteResult = { kind: "route"; id: string; route: Route; stops: BusStop[] };
export type SearchResult = BusResult | StopResult | RouteResult;

export type SearchResults = {
  buses: BusResult[];
  stops: StopResult[];
  routes: RouteResult[];
  total: number;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cheap edit distance, capped — used only for small spelling slips. */
function closeEnough(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/** Match score for a haystack against the query; 0 means no match. */
function score(haystack: string, query: string): number {
  const h = norm(haystack);
  const q = norm(query);
  if (!q) return 0;
  if (h === q) return 100;
  if (h.startsWith(q)) return 80;
  if (h.includes(q)) return 60;
  const words = h.split(" ");
  if (words.some((w) => w.startsWith(q))) return 55;
  if (q.length >= 4 && words.some((w) => closeEnough(w, q))) return 35;
  return 0;
}

function best(fields: (string | null | undefined)[], query: string) {
  return fields.reduce<number>((max, f) => (f ? Math.max(max, score(f, query)) : max), 0);
}

export function searchTransit({
  query,
  buses,
  routes,
  stops,
  activeBuses,
}: {
  query: string;
  buses: Bus[];
  routes: Route[];
  stops: BusStop[];
  activeBuses: ActiveBus[];
}): SearchResults {
  const q = query.trim();
  const routeById = new Map(routes.map((r) => [r.id, r] as const));
  const liveByBusId = new Map(activeBuses.map((a) => [a.bus.id, a] as const));
  const stopsByRoute = new Map<string, BusStop[]>();
  for (const s of stops) {
    if (!s.route_id) continue;
    const list = stopsByRoute.get(s.route_id) ?? [];
    list.push(s);
    stopsByRoute.set(s.route_id, list);
  }
  for (const list of stopsByRoute.values()) list.sort((a, b) => a.sequence - b.sequence);

  const scored = <T>(items: T[], fields: (item: T) => (string | null | undefined)[]) =>
    items
      .map((item) => ({ item, s: best(fields(item), q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.item);

  const busResults: BusResult[] = scored(buses, (b) => {
    const route = b.route_id ? routeById.get(b.route_id) : null;
    const routeStops = b.route_id ? (stopsByRoute.get(b.route_id) ?? []) : [];
    return [
      b.bus_number,
      `bus ${b.bus_number}`,
      b.registration,
      route?.code,
      route?.name,
      ...routeStops.map((s) => s.name),
    ];
  }).map((bus) => ({
    kind: "bus",
    id: bus.id,
    bus,
    route: bus.route_id ? (routeById.get(bus.route_id) ?? null) : null,
    live: liveByBusId.get(bus.id) ?? null,
  }));

  // Live buses first, then by number.
  busResults.sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live)));

  const stopResults: StopResult[] = scored(stops, (s) => [s.name]).map((stop) => ({
    kind: "stop",
    id: stop.id,
    stop,
    route: stop.route_id ? (routeById.get(stop.route_id) ?? null) : null,
  }));

  const routeResults: RouteResult[] = scored(routes, (r) => {
    const rs = stopsByRoute.get(r.id) ?? [];
    return [r.code, r.name, ...rs.map((s) => s.name)];
  }).map((route) => ({
    kind: "route",
    id: route.id,
    route,
    stops: stopsByRoute.get(route.id) ?? [],
  }));

  return {
    buses: busResults,
    stops: stopResults,
    routes: routeResults,
    total: busResults.length + stopResults.length + routeResults.length,
  };
}

export function routeEndpoints(stops: BusStop[]): string | null {
  if (stops.length < 2) return null;
  return `${stops[0]!.name} → ${stops[stops.length - 1]!.name}`;
}
