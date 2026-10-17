"use client";

import { Info, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PhotoUploader } from "@/components/listing/photo-uploader";
import type { StoredImage } from "@/components/listing/types";
import { Button } from "@/components/ui/button";
import { updateSellerPhotos } from "@/server/actions/seller/listings";

/**
 * The seller's "Edit photos": add, remove, reorder (first = cover), then save.
 * Only the photos change; removing or reordering keeps a live plot live.
 */
export function PhotoEditor({ propertyId, initial, live }: { propertyId: string; initial: StoredImage[]; live: boolean }) {
  const router = useRouter();
  const [images, setImages] = useState<StoredImage[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const added = images.some((img) => !initial.some((old) => old.url === img.url));
  const changed = added || images.length !== initial.length || images.some((img, i) => img.url !== initial[i]?.url);

  function save() {
    setError(null);
    start(async () => {
      const r = await updateSellerPhotos(propertyId, images);
      if (!r.ok) return setError(r.message ?? "Something went wrong. Please try again.");
      router.push(r.review ? "/seller/dashboard?photos=review" : "/seller/dashboard?photos=saved");
    });
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-line sm:p-6">
      <PhotoUploader initial={initial} onChange={setImages} onBusyChange={setUploading} />

      {live && added && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-sky-50 p-3.5 text-[13px] leading-relaxed text-sky-900 ring-1 ring-sky-100">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> New photos are checked by our team first. Until then the listing is hidden from buyers.
          Removing or reordering photos keeps it live.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="lg" onClick={() => router.push("/seller/dashboard")} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button size="lg" disabled={!changed || uploading || pending || images.length === 0} onClick={save} className="w-full sm:w-auto">
          {pending || uploading ? <Loader2 className="animate-spin" /> : null}
          {uploading ? "Uploading…" : pending ? "Saving…" : "Save photos"}
        </Button>
      </div>
    </div>
  );
}
