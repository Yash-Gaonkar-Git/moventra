import { useCallback, useEffect, useState } from "react";
import { fetchAllDrivers, setDriverActive, type DriverProfile } from "@/lib/transit";

/**
 * Minimal admin driver-approval list. Reads the existing `drivers` table and
 * flips only the existing `is_active` flag — no schema, RLS or RPC changes.
 */
export function DriverApprovals() {
  const [drivers, setDrivers] = useState<DriverProfile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setDrivers(await fetchAllDrivers());
    } catch (err) {
      setDrivers(null);
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(driver: DriverProfile, next: boolean) {
    if (!next && !window.confirm(`Deactivate driver ${driver.full_name}? They will not be able to start trips.`)) {
      return;
    }
    setActionError(null);
    setBusyId(driver.id);
    try {
      const updated = await setDriverActive(driver.id, next);
      setDrivers((prev) =>
        (prev ?? []).map((d) => (d.id === driver.id ? { ...d, is_active: updated.is_active } : d)),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Driver Approvals</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      <div className="max-h-[320px] overflow-auto">
        {loadError ? (
          <p className="px-4 py-6 text-sm text-destructive">
            Could not load drivers: {loadError}
          </p>
        ) : drivers === null ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading drivers…</p>
        ) : drivers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No drivers registered yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Driver</th>
                <th className="px-3 py-2">Driver ID</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{d.full_name || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{d.id}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                        d.is_active
                          ? "border-success/40 bg-success/15 text-success"
                          : "border-warning/50 bg-warning/25 text-warning-foreground"
                      }`}
                    >
                      {d.is_active ? "Active" : "Pending"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={busyId === d.id}
                      onClick={() => void update(d, !d.is_active)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                        d.is_active
                          ? "border border-border text-foreground hover:bg-muted"
                          : "bg-primary text-primary-foreground hover:opacity-90"
                      }`}
                    >
                      {busyId === d.id ? "Saving…" : d.is_active ? "Deactivate" : "Approve"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {actionError ? (
        <p className="border-t border-border px-4 py-3 text-sm text-destructive">
          Update failed: {actionError}
        </p>
      ) : null}
    </section>
  );
}
