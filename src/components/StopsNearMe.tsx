import { useMemo, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { haversineKm, type BusStop } from "@/lib/transit";

type Props = {
  stops: BusStop[];
  onSelectStop: (stopId: string) => void;
  onSearchStop: () => void;
  onClose: () => void;
};

type GeoState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; lat: number; lng: number }
  | { kind: "denied" }
  | { kind: "unavailable" };

function formatKm(km: number) {
  if (km < 1) return `${Math.max(0.1, Math.round(km * 10) / 10).toFixed(1)} km away`;
  return `${km.toFixed(1)} km away`;
}

/**
 * Frontend-only: reads the device location in the browser, compares it with the
 * stop coordinates the app already loaded, and lists the closest stops first.
 * The location is never stored and never sent anywhere.
 */
export function StopsNearMeSheet({ stops, onSelectStop, onSearchStop, onClose }: Props) {
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });

  // Only ever asked when the passenger taps the button — never on a loop.
  const requestLocation = () => {
    if (geo.kind === "loading") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ kind: "unavailable" });
      return;
    }
    setGeo({ kind: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGeo({ kind: "ready", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        setGeo({ kind: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  const nearby = useMemo(() => {
    if (geo.kind !== "ready") return [];
    return stops
      .map((stop) => ({ stop, km: haversineKm(geo.lat, geo.lng, stop.lat, stop.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8);
  }, [geo, stops]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="text-xl font-black uppercase tracking-tight sm:text-2xl">
          📍 Stops near you
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-border hover:bg-accent"
        >
          <X className="size-5" />
        </button>
      </div>

      {geo.kind === "idle" ? (
        <div className="space-y-3">
          <p className="text-base text-muted-foreground">
            Allow location access to find nearby bus stops.
          </p>
          <button
            onClick={requestLocation}
            className="h-16 w-full rounded-2xl bg-primary text-lg font-black uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
          >
            📍 Allow location
          </button>
        </div>
      ) : null}

      {geo.kind === "loading" ? (
        <p className="rounded-xl bg-muted px-3 py-4 text-base font-semibold">
          Finding your location…
        </p>
      ) : null}

      {geo.kind === "denied" ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-warning/20 px-3 py-3 text-base font-semibold text-warning-foreground">
            📍 Location access is off
          </p>
          <p className="text-base text-muted-foreground">
            Allow location access to find nearby bus stops.
          </p>
          <button
            onClick={requestLocation}
            className="h-16 w-full rounded-2xl bg-primary text-lg font-black uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
          >
            Allow location
          </button>
          <button
            onClick={onSearchStop}
            className="h-14 w-full rounded-2xl border border-border bg-card text-base font-bold uppercase tracking-wide hover:bg-accent"
          >
            🔍 Search for a stop
          </button>
        </div>
      ) : null}

      {geo.kind === "unavailable" ? (
        <div className="space-y-3">
          <p className="text-base font-semibold">Your location is not available right now.</p>
          <button
            onClick={onSearchStop}
            className="h-16 w-full rounded-2xl bg-primary text-lg font-black uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
          >
            🔍 Search for a stop
          </button>
        </div>
      ) : null}

      {geo.kind === "ready" ? (
        nearby.length === 0 ? (
          <div className="space-y-3">
            <p className="text-base font-semibold">No bus stops found near you.</p>
            <button
              onClick={onSearchStop}
              className="h-14 w-full rounded-2xl border border-border bg-card text-base font-bold uppercase tracking-wide hover:bg-accent"
            >
              <Search className="mr-2 inline size-5" />
              Search for a stop
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {nearby.map(({ stop, km }) => (
              <li key={stop.id}>
                <button
                  onClick={() => onSelectStop(stop.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left transition hover:border-primary hover:bg-accent"
                >
                  <MapPin className="size-6 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-bold">🚏 {stop.name}</span>
                    <span className="block text-base text-muted-foreground">{formatKm(km)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <p className="text-xs text-muted-foreground">
        Your location stays on your phone. It is only used to measure the distance to stops.
      </p>
    </div>
  );
}
