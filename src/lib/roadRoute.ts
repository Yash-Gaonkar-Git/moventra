/**
 * Road-following route geometry.
 *
 * Fetches the real driving path between ordered stop coordinates from OSRM
 * (public OpenStreetMap routing service, no API key required). The result is
 * cached per coordinate list so panning/zooming the map never refetches.
 *
 * If a different routing provider that needs a key is configured through
 * `VITE_ROUTING_URL`, that base URL is used instead (never hard-code keys).
 */

export type LatLng = [number, number];

const BASE =
  (import.meta.env['VITE_ROUTING_URL'] as string | undefined)?.replace(/\/$/, "") ??
  "https://router.project-osrm.org";

const cache = new Map<string, LatLng[]>();
const inflight = new Map<string, Promise<LatLng[]>>();

function keyOf(points: LatLng[]) {
  return points.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(";");
}

/** Cached road geometry, if already fetched. */
export function getCachedRoadRoute(points: LatLng[]): LatLng[] | undefined {
  return cache.get(keyOf(points));
}

/**
 * Resolve the driving path through all given stops, in order.
 * Falls back to the straight stop-to-stop line when routing is unavailable.
 */
export function fetchRoadRoute(points: LatLng[]): Promise<LatLng[]> {
  const key = keyOf(points);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const running = inflight.get(key);
  if (running) return running;

  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `${BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const task = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Routing failed (${res.status})`);
      const data = (await res.json()) as {
        code?: string;
        routes?: { geometry?: { coordinates?: [number, number][] } }[];
      };
      const line = data.routes?.[0]?.geometry?.coordinates;
      if (data.code !== "Ok" || !line || line.length < 2) throw new Error("No route geometry");
      const path = line.map(([lng, lat]) => [lat, lng] as LatLng);
      cache.set(key, path);
      return path;
    } catch {
      // Keep the map usable: fall back to the ordered stop line.
      cache.set(key, points);
      return points;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}
