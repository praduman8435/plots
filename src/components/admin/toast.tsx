"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Toast = { id: number; message: string; tone: "success" | "error" };
const EVENT = "plots-admin-toast";
let seq = 0;

/** Shows a short message at the bottom of the admin screen. Survives the re-render after a server action. */
export function toast(message: string, tone: Toast["tone"] = "success") {
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: ++seq, message, tone } }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setToasts((list) => [...list.slice(-2), t]);
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.tone === "error" ? 7000 : 4500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--sticky-bottom,0px)+0.75rem)] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-64"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-md animate-fade-up items-start gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lift",
            t.tone === "error" ? "bg-red-700 text-white" : "bg-brand-950 text-white",
          )}
        >
          {t.tone === "error" ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-300" aria-hidden />
          )}
          <p className="flex-1">{t.message}</p>
          <button
            type="button"
            onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
            className="-my-1 -mr-1 flex size-7 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
