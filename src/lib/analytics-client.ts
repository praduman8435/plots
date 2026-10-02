"use client";

import type { ClientEvent } from "./analytics-events";

const VISITOR_KEY = "plots.vid";

/** Anonymous random id per browser — no personal data. */
export function visitorId(): string | null {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Fire-and-forget event. Never blocks the UI and never throws. */
export function track(name: ClientEvent, data: { propertyId?: string; props?: Record<string, string | number | boolean | null> } = {}) {
  try {
    const body = JSON.stringify({ name, visitorId: visitorId(), ...data });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    else fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  } catch {}
}
