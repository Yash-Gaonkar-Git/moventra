import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  formatAge,
  kmh,
  type ActiveBus,
  type BusStop,
  type Route,
  type StopStatus,
} from "@/lib/transit";
import { fetchRoadRoute, getCachedRoadRoute } from "@/lib/roadRoute";


type Props = {
  activeBuses: ActiveBus[];
  routes: Route[];
  stops: BusStop[];
  selectedRouteId?: string | null;
  stopStatuses?: Record<string, StopStatus>;
  onSelectBus?: (busId: string) => void;
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string) => void;
  /** Bump `token` to re-centre the map on this bus's existing GPS marker. */
  focusBus?: { busId: string; token: number } | null | undefined;
  className?: string;
};



const DEFAULT_CENTER: [number, number] = [19.9975, 73.7898];

const statusColor: Record<string, string> = {
  live: "#16a34a",
  delayed: "#d97706",
  offline: "#64748b",
  completed: "#1e293b",
};

function busIcon(label: string, status: string) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-4px)">
      <div style="background:${statusColor[status] ?? "#64748b"};color:#fff;font:600 11px/1 ui-sans-serif,system-ui;padding:6px 8px;border-radius:999px;box-shadow:0 2px 8px rgba(15,23,42,.35);white-space:nowrap">🚌 ${label}</div>
      <div style="width:2px;height:8px;background:${statusColor[status] ?? "#64748b"}"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Compact "101→" / "106←" so direction is visible on the pin itself, not just the popup. */
function pinLabel(item: ActiveBus): string {
  const arrow = item.directionLabel.startsWith("Bicholim") ? "→" : "←";
  return `${item.bus.bus_number}${arrow}`;
}

export default function TransitMap({
  activeBuses,
  routes,
  stops,
  selectedRouteId,
  stopStatuses,
  onSelectBus,
  selectedStopId,
  onSelectStop,
  focusBus,
  className,
}: Props) {

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const busesRef = useRef<ActiveBus[]>(activeBuses);
  busesRef.current = activeBuses;
  const onSelectStopRef = useRef(onSelectStop);
  onSelectStopRef.current = onSelectStop;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(DEFAULT_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Routes + stops layer
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.clearLayers();
    const shown = selectedRouteId ? routes.filter((r) => r.id === selectedRouteId) : routes;
    for (const route of shown) {
      const routeStops = stops
        .filter((s) => s.route_id === route.id)
        .slice()
        .sort((a, b) => a.sequence - b.sequence);
      const stopLine = routeStops.map((s) => [s.lat, s.lng] as [number, number]);
      // Prefer the stored route geometry; otherwise follow the real road
      // network between the ordered stops.
      const storedPath =
        Array.isArray(route.path) && route.path.length > 1
          ? (route.path as [number, number][])
          : null;
      const line: [number, number][] =
        storedPath ?? (stopLine.length > 1 ? getCachedRoadRoute(stopLine) ?? stopLine : stopLine);
      if (line.length > 1) {
        const polyline = L.polyline(line, {
          color: route.color,
          weight: 5,
          opacity: 0.75,
          smoothFactor: 1,
          lineJoin: "round",
          lineCap: "round",
        })
          .bindTooltip(`${route.code} · ${route.name}`)
          .addTo(overlay);
        if (!storedPath && stopLine.length > 1) {
          void fetchRoadRoute(stopLine).then((road) => {
            if (road.length > 1 && overlayRef.current?.hasLayer(polyline)) {
              polyline.setLatLngs(road);
            }
          });
        }
      }
    }

    const shownIds = new Set(shown.map((r) => r.id));
    const visibleStops = stops
      .filter((stop) => !selectedRouteId || (stop.route_id && shownIds.has(stop.route_id)))
      .slice()
      .sort((a, b) => a.sequence - b.sequence);
    for (const stop of visibleStops) {
      const routeName = routes.find((r) => r.id === stop.route_id)?.name ?? "";
      const status = stopStatuses?.[stop.id];
      const style =
        status === "passed"
          ? { bg: "#16a34a", fg: "#ffffff", ring: "#16a34a", size: 22 }
          : status === "next"
            ? { bg: "#f97316", fg: "#ffffff", ring: "#f97316", size: 28 }
            : { bg: "#ffffff", fg: "#0f172a", ring: "#0f172a", size: 22 };
      const label = status ? status.toUpperCase() : "";
      const selected = selectedStopId === stop.id;
      if (selected) {
        style.size = 34;
        style.ring = "#2563eb";
      }
      const marker = L.marker([stop.lat, stop.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;justify-content:center;width:${style.size}px;height:${style.size}px;border-radius:9999px;background:${style.bg};border:2px solid ${style.ring};color:${style.fg};font-size:11px;font-weight:700;line-height:1;box-shadow:${selected ? "0 0 0 6px rgba(37,99,235,.25), 0 2px 8px rgba(15,23,42,.4)" : "0 1px 4px rgba(15,23,42,.35)"};cursor:pointer">${stop.sequence}</div>`,
          iconSize: [style.size, style.size],
          iconAnchor: [style.size / 2, style.size / 2],
        }),
      })
        .bindPopup(
          `<div style="font:400 12px/1.5 ui-sans-serif,system-ui">
            <strong style="font-size:13px">${stop.sequence}. ${stop.name}</strong><br/>
            ${routeName ? routeName : "Bus stop"}
            ${label ? `<br/>Status: <strong>${label}</strong>` : ""}
          </div>`,
        )
        .addTo(overlay);
      marker.on("click", () => onSelectStopRef.current?.(stop.id));
    }
    // No live bus position yet: frame the route and its stops instead of the
    // default view. When a bus location exists, the bus-fit below takes priority.
    const map = mapRef.current;
    const noBusLocated = busesRef.current.every((b) => !b.location);
    if (
      map &&
      !fittedRef.current &&
      noBusLocated &&
      markersRef.current.size === 0 &&
      visibleStops.length > 0
    ) {
      map.fitBounds(
        L.latLngBounds(visibleStops.map((s) => [s.lat, s.lng] as [number, number])).pad(0.25),
        { maxZoom: 14 },
      );
      fittedRef.current = true;
    }
  }, [routes, stops, selectedRouteId, stopStatuses, selectedStopId]);


  // Live bus markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const item of activeBuses) {
      if (!item.location) continue;
      seen.add(item.bus.id);
      const pos: [number, number] = [item.location.lat, item.location.lng];
      const popup = `<div style="font:400 12px/1.5 ui-sans-serif,system-ui">
        <strong style="font-size:13px">Bus ${item.bus.bus_number}${item.isSimulated ? " (sim)" : ""}</strong><br/>
        ${item.directionLabel}<br/>
        Speed: ${kmh(item.avgSpeedMs)}<br/>
        Last update: ${item.isSimulated ? "live" : formatAge(item.ageSeconds)}<br/>
        Status: <strong style="color:${statusColor[item.status]}">${item.status.toUpperCase()}</strong>
      </div>`;
      const existing = markersRef.current.get(item.bus.id);
      if (existing) {
        existing.setLatLng(pos);
        existing.setIcon(busIcon(pinLabel(item), item.status));
        existing.setPopupContent(popup);
      } else {
        const marker = L.marker(pos, { icon: busIcon(pinLabel(item), item.status) })
          .bindPopup(popup)
          .addTo(map);
        marker.on("click", () => onSelectBus?.(item.bus.id));
        markersRef.current.set(item.bus.id, marker);
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    if (!fittedRef.current && seen.size > 0) {
      const bounds = L.latLngBounds(
        activeBuses.filter((b) => b.location).map((b) => [b.location!.lat, b.location!.lng]),
      );
      map.fitBounds(bounds.pad(0.4), { maxZoom: 15 });
      fittedRef.current = true;
    }
  }, [activeBuses, onSelectBus]);

  // "Track bus": re-centre on the bus's existing real GPS marker. No new
  // tracking logic, no invented position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusBus) return;
    const item = busesRef.current.find((b) => b.bus.id === focusBus.busId);
    if (!item?.location) return;
    map.flyTo([item.location.lat, item.location.lng], Math.max(map.getZoom(), 15), {
      duration: 0.8,
    });
    markersRef.current.get(focusBus.busId)?.openPopup();
  }, [focusBus]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}

