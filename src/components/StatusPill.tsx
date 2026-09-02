import type { BusStatus } from "@/lib/transit";

const STATUS_META: Record<BusStatus, { icon: string; text: string; cls: string }> = {
  live: { icon: "🟢", text: "LIVE", cls: "border-success/40 bg-success/15 text-success" },
  delayed: {
    icon: "🟡",
    text: "DELAYED",
    cls: "border-warning/50 bg-warning/25 text-warning-foreground",
  },
  offline: { icon: "🔴", text: "OFFLINE", cls: "border-border bg-muted text-foreground" },
  completed: {
    icon: "⚫",
    text: "TRIP COMPLETED",
    cls: "border-primary/30 bg-primary/10 text-primary",
  },
};

/**
 * Status is always icon + word (never colour alone), so it stays readable for
 * colour-blind users and on low-contrast screens.
 */
export function StatusPill({ status }: { status: BusStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.offline;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${meta.cls}`}
    >
      <span aria-hidden>{meta.icon}</span>
      <span>{meta.text}</span>
    </span>
  );
}
