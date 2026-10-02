"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics-client";

/** Records a search (and whether filters were used) once per distinct query. */
export function SearchTracker({ query, filtered, results }: { query: string; filtered: boolean; results: number }) {
  useEffect(() => {
    track(filtered ? "filter" : "search", { props: { query: query.slice(0, 120), results } });
  }, [query, filtered, results]);
  return null;
}
