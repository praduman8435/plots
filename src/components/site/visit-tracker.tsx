"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics-client";

/** One "visit" per browser session — the top of the funnel. */
export function VisitTracker() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("plots.visit")) return;
      sessionStorage.setItem("plots.visit", "1");
    } catch {}
    track("visit", { props: { path: window.location.pathname.slice(0, 100), ref: document.referrer ? new URL(document.referrer).hostname.slice(0, 100) : null } });
  }, []);
  return null;
}
