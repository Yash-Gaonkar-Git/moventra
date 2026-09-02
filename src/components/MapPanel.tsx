import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { ActiveBus, BusStop, Route, StopStatus } from "@/lib/transit";

const TransitMap = lazy(() => import("./TransitMap"));

type Props = {
  activeBuses: ActiveBus[];
  routes: Route[];
  stops: BusStop[];
  selectedRouteId?: string | null;
  stopStatuses?: Record<string, StopStatus>;
  onSelectBus?: (busId: string) => void;
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string) => void;
  focusBus?: { busId: string; token: number } | null | undefined;
  className?: string;

};


function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  );
}

export function MapPanel(props: Props) {
  return (
    <ClientOnly fallback={<MapSkeleton />}>
      <Suspense fallback={<MapSkeleton />}>
        <TransitMap {...props} />
      </Suspense>
    </ClientOnly>
  );
}
