import { useMemo } from "react";
import { StatusPill } from "@/components/StatusPill";
import type { BusAlert } from "@/hooks/useBusAlerts";
import { formatAge, LIVE_THRESHOLD_S, type ActiveBus, type BusStop } from "@/lib/transit";

type Props = {
  stop: BusStop;
  /** Every active bus already loaded by the app. */
  activeBuses: ActiveBus[];
  isAlertOn: (busId: string, stopId: string) => boolean;
  onTurnOn: (alert: BusAlert) => void;
  onTurnOff: (busId: string, stopId: string) => void;
  /** Centres the existing live map on this bus. */
  onTrackBus?: ((busId: string) => void) | undefined;
  onClose: () => void;
};

type BusAtStop = {
  item: ActiveBus;
  /** Real ETA, only when this stop is the bus's next stop (the one the app can time reliably). */
  etaMinutes: number | null;
  stopsAway: number | null;
  passed: boolean;
  direction: string | null;
};

/** Builds the arrival information for one stop out of data the app already has. */
function busesForStop(activeBuses: ActiveBus[], stop: BusStop): BusAtStop[] {
  return activeBuses
    .map((item) => {
      const progress = item.progress;
      if (!progress) return null;
      const index = progress.stops.findIndex((s) => s.stop.id === stop.id);
      if (index === -1) return null;
      const entry = progress.stops[index]!;
      const isNext = progress.nextStop?.id === stop.id;
      const first = progress.stops[0]?.stop.name ?? null;
      const last = progress.stops[progress.stops.length - 1]?.stop.name ?? null;
      const nextIndex = progress.stops.findIndex((s) => s.stop.id === progress.nextStop?.id);
      return {
        item,
        etaMinutes: isNext ? progress.etaMinutes : null,
        stopsAway: nextIndex === -1 ? null : Math.max(0, index - nextIndex),
        passed: entry.status === "passed",
        direction: first && last ? `${first} → ${last}` : null,
      } satisfies BusAtStop;
    })
    .filter((b): b is BusAtStop => b !== null && !b.passed && b.item.status !== "completed")
    .sort((a, b) => {
      if (a.etaMinutes != null && b.etaMinutes != null) return a.etaMinutes - b.etaMinutes;
      if (a.etaMinutes != null) return -1;
      if (b.etaMinutes != null) return 1;
      return (a.stopsAway ?? 99) - (b.stopsAway ?? 99);
    });
}

export function StopPanel({
  stop,
  activeBuses,
  isAlertOn,
  onTurnOn,
  onTurnOff,
  onTrackBus,
  onClose,
}: Props) {
  const buses = useMemo(() => busesForStop(activeBuses, stop), [activeBuses, stop]);
  const [first, ...upcoming] = buses;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-xl font-black uppercase tracking-tight sm:text-2xl">
          <span aria-hidden>🚏</span>
          <span className="truncate">{stop.name}</span>
        </h2>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-accent"
        >
          Close
        </button>
      </div>

      {!first ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-base font-semibold text-muted-foreground">
          🚍 No live buses available
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Next bus
          </p>
          <BusCard
            entry={first}
            stop={stop}
            isAlertOn={isAlertOn}
            onTurnOn={onTurnOn}
            onTurnOff={onTurnOff}
            onTrackBus={onTrackBus}
            highlight
          />

          {upcoming.length > 0 ? (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Later buses
              </p>
              {upcoming.map((entry) => (
                <BusCard
                  key={entry.item.bus.id}
                  entry={entry}
                  stop={stop}
                  isAlertOn={isAlertOn}
                  onTurnOn={onTurnOn}
                  onTurnOff={onTurnOff}
                  onTrackBus={onTrackBus}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

    </div>
  );
}

function BusCard({
  entry,
  stop,
  isAlertOn,
  onTurnOn,
  onTurnOff,
  onTrackBus,
  highlight,
}: {
  entry: BusAtStop;
  stop: BusStop;
  isAlertOn: (busId: string, stopId: string) => boolean;
  onTurnOn: (alert: BusAlert) => void;
  onTurnOff: (busId: string, stopId: string) => void;
  onTrackBus?: ((busId: string) => void) | undefined;
  highlight?: boolean;
}) {
  const { item } = entry;
  const on = isAlertOn(item.bus.id, stop.id);
  const stale = item.ageSeconds > LIVE_THRESHOLD_S;
  const nextStopName = item.progress?.nextStop?.name ?? null;
  const nextDistanceKm = item.progress?.nextDistanceKm ?? null;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background"
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-2xl">
              🚌
            </span>
            <span className="text-2xl font-black tracking-tight sm:text-3xl">
              BUS {item.bus.bus_number}
            </span>
          </div>
          {entry.direction ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">{entry.direction}</p>
          ) : null}
        </div>
        <StatusPill status={item.status} />
      </div>

      <div className="mt-3 rounded-xl bg-card px-4 py-3">
        {entry.etaMinutes != null ? (
          <>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Arriving in
            </p>
            <p className="text-4xl font-black leading-tight">
              {entry.etaMinutes} <span className="text-xl font-bold">min</span>
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Arriving in
            </p>
            <p className="text-lg font-bold">⏱️ ETA unavailable</p>
            <p className="text-sm text-muted-foreground">
              {entry.stopsAway != null && entry.stopsAway > 0
                ? `The bus still has ${entry.stopsAway} stop${entry.stopsAway > 1 ? "s" : ""} to go.`
                : `Last update ${formatAge(item.ageSeconds)}.`}
            </p>
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Next stop
          </p>
          <p className="truncate text-base font-bold">{nextStopName ?? "Not available"}</p>
        </div>
        <div className="rounded-xl bg-muted px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Distance
          </p>
          <p className="text-base font-bold">
            {nextDistanceKm != null ? `${nextDistanceKm.toFixed(1)} km` : "Not available"}
          </p>
        </div>
      </div>

      {stale ? (
        <p className="mt-3 rounded-xl bg-warning/20 px-4 py-2.5 text-sm font-semibold text-warning-foreground">
          🟡 Location not updated · Last updated {formatAge(item.ageSeconds)}
        </p>
      ) : null}

      {onTrackBus ? (
        <button
          onClick={() => onTrackBus(item.bus.id)}
          className="mt-3 h-14 w-full rounded-xl border-2 border-primary bg-background text-lg font-black text-primary transition hover:bg-accent"
        >
          🗺️ TRACK BUS
        </button>
      ) : null}

      {on ? (
        <div className="mt-3 space-y-2 rounded-xl bg-success/10 px-4 py-3">
          <p className="text-base font-bold text-success">🔔 ALERT ENABLED</p>
          <p className="text-sm text-muted-foreground">
            We'll alert you when Bus {item.bus.bus_number} is approaching {stop.name}.
          </p>
          <button
            onClick={() => onTurnOff(item.bus.id, stop.id)}
            className="h-11 w-full rounded-xl border border-border bg-background text-base font-bold hover:bg-accent"
          >
            Turn Off Alert
          </button>
        </div>
      ) : (
        <button
          onClick={() =>
            onTurnOn({
              busId: item.bus.id,
              busNumber: item.bus.bus_number,
              stopId: stop.id,
              stopName: stop.name,
            })
          }
          className="mt-3 h-14 w-full rounded-xl bg-primary text-lg font-black text-primary-foreground transition hover:opacity-90"
        >
          🔔 ALERT ME
        </button>
      )}
    </div>
  );
}

export function MyAlerts({
  alerts,
  onTurnOff,
}: {
  alerts: BusAlert[];
  onTurnOff: (busId: string, stopId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        My bus alerts
      </p>
      {alerts.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">You don't have any bus alerts.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {alerts.map((a) => (
            <li
              key={`${a.busId}-${a.stopId}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-muted px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-base font-bold">🔔 Bus {a.busNumber}</p>
                <p className="truncate text-sm text-muted-foreground">{a.stopName}</p>
              </div>
              <button
                onClick={() => onTurnOff(a.busId, a.stopId)}
                className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold hover:bg-accent"
              >
                Turn Off
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
