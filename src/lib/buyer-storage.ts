/**
 * The buyer's name and number, remembered in this browser so they type them once
 * (contact a seller, ask for land). Per-device convenience only: never trusted by the server.
 */
export type StoredBuyer = { name: string; phone: string };

const KEY = "plots.buyer";

export function readStoredBuyer(): StoredBuyer | null {
  try {
    const raw = localStorage.getItem(KEY);
    const b = raw ? (JSON.parse(raw) as Partial<StoredBuyer>) : null;
    return typeof b?.name === "string" && typeof b?.phone === "string" && b.name && b.phone ? { name: b.name, phone: b.phone } : null;
  } catch {
    return null;
  }
}

export function storeBuyer(buyer: StoredBuyer): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(buyer));
  } catch {
    // Private mode or storage full: they'll just type it again next time.
  }
}

export function forgetStoredBuyer(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
