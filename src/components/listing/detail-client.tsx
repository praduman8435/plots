"use client";

import { ArrowLeft, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics-client";

/** Counts one view per plot per browser session. */
export function ViewBeacon({ id }: { id: string }) {
  useEffect(() => {
    const key = `plots.viewed.${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    fetch(`/api/properties/${id}/view`, { method: "POST", keepalive: true }).catch(() => {});
    track("property_view", { propertyId: id });
  }, [id]);
  return null;
}

export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/search"))}
      className={className}
      aria-label="Back"
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}

export function ShareButton({ title, className, label }: { title: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }
  return (
    <button type="button" onClick={share} className={className} aria-label="Share this plot">
      <Share2 className="size-[18px]" />
      {label && <span>{copied ? "Link copied" : label}</span>}
    </button>
  );
}
