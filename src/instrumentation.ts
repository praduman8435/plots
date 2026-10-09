import type { Instrumentation } from "next";

/** Runs once per server instance start. Refuses to serve with an unsafe production configuration. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkProductionEnv } = await import("./lib/env-check");
  const { errors, warnings } = checkProductionEnv();
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[config] ${e}`);
    throw new Error(`Unsafe production configuration: ${errors.join(" ")}`);
  }
}

/**
 * Every unhandled server error, as one structured log line (route + digest).
 * No request headers, bodies or cookies are logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { log } = await import("./lib/log");
  const e = err as { message?: string; digest?: string };
  log("error", "request.unhandled_error", {
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
    digest: e.digest,
    err: e.message,
  });
};
