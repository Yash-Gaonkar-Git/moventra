// ---------------------------------------------------------------------------
// TEMPORARY PRESENTATION-DEMO SESSION STORE
// ---------------------------------------------------------------------------
// This is NOT Supabase Auth. It stores nothing but a label ("demo_admin" or
// "demo_driver_101") in localStorage under a key that can never collide with
// or be confused for Supabase's own session storage (which uses its own
// "sb-<project-ref>-auth-token" key). No token, no credentials, no backend
// call of any kind — just "which demo screen was unlocked," so a page
// refresh doesn't kick the presenter back to the login screen.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "transittrack.demoSession";

export type DemoSessionKind = "demo_admin" | "demo_driver_101";

export function getDemoSession(): DemoSessionKind | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "demo_admin" || v === "demo_driver_101" ? v : null;
  } catch {
    return null;
  }
}

export function setDemoSession(kind: DemoSessionKind): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    // localStorage unavailable (private browsing etc.) — demo still works
    // for this page load, it just won't survive a refresh.
  }
}

export function clearDemoSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// Separate demo session for the Passenger "Alert Me" feature. Kept under its
// own storage key (not the admin/driver one above) so a demo-passenger tab
// and a demo-driver/demo-admin tab can coexist without stomping on each
// other's localStorage value.
// ---------------------------------------------------------------------------
const PASSENGER_STORAGE_KEY = "transittrack.demoPassengerSession";

export function getDemoPassengerSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PASSENGER_STORAGE_KEY) === "demo_passenger";
  } catch {
    return false;
  }
}

export function setDemoPassengerSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PASSENGER_STORAGE_KEY, "demo_passenger");
  } catch {
    // no-op
  }
}

export function clearDemoPassengerSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PASSENGER_STORAGE_KEY);
  } catch {
    // no-op
  }
}
